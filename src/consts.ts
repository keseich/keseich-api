import { Set } from './types';

export const AUDIO_LOCATION = "https://keseich.onrender.com/"//'http://localhost:8060/';

export enum STUDY_TYPE {
  NEW = "new",
  REVIEW = "review"
}

export const BAER = "bärndütsch";
export const ENGL = "english";
export const AUDI = "id";
export const INFO = "info";


export const SETS: Set[] = [{
  name: "Vocab",
  collection: "woerter",
  idField: "id",
  directions: [
    { name: "Schrybe", question: ENGL, answer: BAER, extras: [] },
    { name: "Läse", question: BAER, answer: ENGL, extras: [INFO] },
    { name: "Lose", question: AUDI, answer: ENGL, extras: [] }
  ],
  info: [INFO],
  audio: AUDI
}]/*, {
  name: "Sentences",
  collection: "core10k",
  idField: "2k1-Kanken Opt Sort",
  directions: [
    {
      name: "Listening", numOptions: 10, question: SEN_AUD, answer: SEN_JAP,
      extras: [SEN_ENG]
    },
    {
      name: "Reading", numOptions: 10, question: SEN_JAP, answer: SEN_ENG,
      extras: [SEN_JAP]
    },
    {
      name: "Writing", numOptions: 10, question: SEN_ENG, answer: SEN_JAP,
      extras: []
    }
  ],
  info: [],
  audio: SEN_AUD
}];*/