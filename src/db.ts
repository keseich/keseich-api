import * as _ from 'lodash';
import { MongoClient, Db, ObjectID } from 'mongodb';
import { URL } from './config';
import { DbUser, Memory, MemoryFilter, MemoryUpdate,　DbStudy, DbAnswer } from './db-types';
import { SETS } from './consts';

let db: Db;

export function connect() {
  return MongoClient.connect(URL)
    .then(client => db = client.db('rememberize'));
}

export function getNumberOfDocs(collection): Promise<number> {
  return db.collection(collection).count({});
}

export function findOne(collection: string, filter: {}) {
  return db.collection(collection).findOne(filter);
}

export function findTen(collection: string, query?: {}, sortField?: string) {
  let sort = sortField ? {[sortField]: 1} : {};
  return db.collection(collection).find(query).sort(sort).limit(10).toArray();
}

export function find(collection: string, query?: {}, projection?: {}) {
  return db.collection(collection).find(query).project(projection).toArray();
}

export function updateMany(coll: string, filter: {}, update: {}) {
  db.collection(coll).updateMany(filter, update);
}

export function insertStudy(username: string, study: DbStudy): Promise<ObjectID> {
  return db.collection(username+"_studies").insertOne(study).then(o => o.insertedId);
}

export function updateStudyPoints(username: string, studyId: ObjectID, points: number) {
  return db.collection(username+"_studies").updateOne({_id: studyId}, { $set: {points: points} });
}

export function updateStudyThinkingTime(username: string, studyId: ObjectID, duration: number) {
  return db.collection(username+"_studies").updateOne({_id: studyId}, { $set: {thinkingTime: duration} });
}

export function findMemory(username: string, filter: MemoryFilter): Promise<Memory> {
  return findOne(username+"_memories", filter);
}

export function insertMemory(username: string, memory: MemoryFilter) {
  return db.collection(username+"_memories").insertOne(memory);
}

export function updateMemory(username: string, memory: MemoryFilter, update: MemoryUpdate) {
  return db.collection(username+"_memories").updateOne(memory, { $set: update });
}

export async function updateAllStudyThinkingTimes(username: string): Promise<any> {
  let studies = await find(username+"_studies")
  let answers = await find(username+"_memories", {}, {answers: 1});
  answers = _.flatten(answers.map(a => a.answers));
  return Promise.all(studies.map(async s => {
    let attempts = _.flatten(
      answers.filter(a => a.studyId.toString() === s._id.toString())
        .map(a => a.attempts));
    let thinkingTime = _.sum(attempts.map(a => a.duration));
    return db.collection(username+"_studies")
      .updateOne({_id: s._id}, { $set: {thinkingTime: thinkingTime} });
  }));
}

export async function getStudiesPerDay(username): Promise<number[]> {
  let agg = [
    { $group: {
      _id: { year: {$year: "$endTime"}, month: {$month: "$endTime"}, day: {$dayOfMonth :"$endTime"} },
      count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const results = await aggregateStudiesWithGapDays(username, agg);
  return results.map(r => r ? r.count : 0);
}

export async function getNewPerDay(username): Promise<number[]> {
  let agg = [
    { $match: { type: "new" } },
    { $group: {
      _id: { year: {$year: "$endTime"}, month: {$month: "$endTime"}, day: {$dayOfMonth :"$endTime"} },
      count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const results = await aggregateStudiesWithGapDays(username, agg);
  return results.map(r => r ? r.count : 0);
}

export async function getDurationPerDay(username): Promise<number[]> {
  let agg = [
    { $group: {
      _id: { year: {$year: "$endTime"}, month: {$month: "$endTime"}, day: {$dayOfMonth :"$endTime"} },
      duration: { $sum: { $subtract: [ "$endTime", "$startTime" ] } } } },
    { $sort: { _id: 1 } }
  ];
  const results = await aggregateStudiesWithGapDays(username, agg);
  return results.map(r => r ? r.duration / 1000 / 60 : 0);
}

export async function getThinkingTimePerDay(username: string): Promise<number[]> {
  let agg = [
    { $group: {
      _id: { year: {$year: "$endTime"}, month: {$month: "$endTime"}, day: {$dayOfMonth :"$endTime"} },
      thinkingTime: { $sum: "$thinkingTime" } } },
    { $sort: { _id: 1 } }
  ];
  const results = await aggregateStudiesWithGapDays(username, agg);
  return results.map(r => r ? r.thinkingTime / 1000 / 60 : 0);
}

export async function getPointsPerDay(username): Promise<number[]> {
  let agg = [
    { $group: {
      _id: { year: {$year: "$endTime"}, month: {$month: "$endTime"}, day: {$dayOfMonth :"$endTime"} },
      points: { $sum: "$points" } } },
    { $sort: { _id: 1 } }
  ];
  const results = await aggregateStudiesWithGapDays(username, agg);
  return results.map(r => r ? r.points : 0);
}

async function aggregateStudiesWithGapDays(username: string, aggregate: {}[]) {
  const results = await db.collection(username+"_studies").aggregate(aggregate).toArray();
  results.forEach(r => r["date"] = r["_id"]["year"]+"/"+r["_id"]["month"]+"/"+r["_id"]["day"])
  let dates = getAllDatesBetween(results[0].date, _.last(results).date).map(d => toYMDString(d));
  return dates.map(d => results.filter(r => r.date == d)[0]);
}

export function getTotalPoints(username): Promise<number> {
  let agg = { $group: { _id: null, points: { $sum: "$level" } } };
  return db.collection(username+"_memories").aggregate([agg]).toArray()
    .then(a => a[0].points)
    .catch(e => 0);
}

export async function findIdsToReview(username, set: number, direction: number): Promise<number[]> {
  let query = {
    nextUp: {$lt: new Date(Date.now())},
    set: set,
    direction: direction
  };
  let ids = await db.collection(username+"_memories").find(query)
    .project({_id:0, wordId:1}).toArray();
  return ids.map(i => i.wordId);
}

export async function findMaxIdInMemory(username, set: number,
    direction: number): Promise<number> {
  let groups = await db.collection(username+"_memories").aggregate([
     { $group: { _id: { set: "$set", dir: "$direction"}, max: { $max: "$wordId" } } }
  ]).toArray();
  let group = groups.filter(g =>
    g["_id"].set === set && g["_id"].dir === direction)[0]
  return group && group.max ? group.max : 0;
}

export async function findIdsInMemory(username: string, set: number, direction: number): Promise<number[]> {
  return await db.collection(username+"_memories")
    .find({ set: set, direction: direction })
    .project({ _id: 0, wordId: 1 }).toArray();
}

export async function getMemoryByLevel(username) {
  let levels = [];
  let groups = await db.collection(username+"_memories").aggregate([
     { $group: { _id: "$level", count: { $sum: 1 } } }
  ]).toArray();
  groups.forEach(g => levels[g["_id"]-1] = g["count"]);
  return levels;
}

export async function findReviewByDirection(username) {
  let groups = await db.collection(username+"_memories").aggregate([
    { $match: { nextUp: {$lt: new Date(Date.now())} } },
    { $group: { _id: { set: "$set", dir: "$direction"}, count: { $sum: 1 } } }
  ]).toArray();
  return mapToSets(groups);
}

export async function getMemoryByDirection(username) {
  let groups = await db.collection(username+"_memories").aggregate([
    //{ $group: { _id: { set: "$set", dir: "$direction"}, count: { $sum: 1 } } }
    //actually get max word id so that it includes ignored hiragana reading ones
    { $group: { _id: { set: "$set", dir: "$direction"}, count: { $max: "$wordId" } } }
  ]).toArray();
  return mapToSets(groups);
}

function mapToSets(groupedResults: {count: number}[]) {
  return SETS.map((s,j) => s.directions.map((d,i) => {
    let group = groupedResults.filter(g => g["_id"].set === j && g["_id"].dir === i);
    return group.length > 0 ? group[0].count : 0
  }));
}

export async function checkLogin(username, password): Promise<{}> {
  let users = db.collection('users');
  let user: DbUser = await users.findOne({username: username});
  if (!user) {
    user = createUser(username, password);
    await users.insert(user);
    return {success: true};
  }
  return {success: password === user.password};
}

export function insert(coll, docs) {
  return db.collection(coll).insertMany(docs).then(r => r.insertedCount);
}

function createUser(username: string, password: string): DbUser {
  return {
    username: username,
    password: password,
    created: new Date(Date.now())
  }
}

export async function toInt(coll: string, field: string) {
  let recs = await db.collection(coll).find().toArray();
  recs.forEach(x =>
    db.collection(coll).update({_id: x._id}, {$set: {[field]: parseInt(x[field])}}));
}

function getAllDatesBetween(fromDate: string, toDate: string) {
  const dates: Date[] = [];
  let currentDate = new Date(fromDate);
  currentDate.setHours(12); //to handle daylight savings
  const endDate = new Date(toDate);
  endDate.setHours(23);
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

function toYMDString(date: Date) {
  return date.getFullYear()+"/"+(date.getMonth()+1)+"/"+date.getDate();
}