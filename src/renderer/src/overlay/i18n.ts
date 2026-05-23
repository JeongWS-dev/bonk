/**
 * Tiny i18n for the break overlay. Uses navigator.language (which Electron
 * inherits from the OS) to pick a language pack. Falls back to English.
 *
 * Kept inline rather than pulled into i18next-style infrastructure because
 * V0 only has ~12 strings — bringing in a library would be overkill.
 */

import type { SkipReason } from './OverlayApp'

export interface Strings {
  metaWithApp: (min: number, app: string) => string
  metaWithoutApp: (min: number) => string
  exerciseTitle: string
  exerciseSub: string
  take: string
  snooze: string
  skip: string
  skipWhy: string
  dismissAria: string
  skipOptions: Record<SkipReason, string>
}

const EN: Strings = {
  metaWithApp: (min, app) => `${min} min in ${app}`,
  metaWithoutApp: (min) => `${min} min so far`,
  exerciseTitle: 'Quick 30-sec stretch',
  exerciseSub: '(animated demo coming in v0.2)',
  take: '✓ Take',
  snooze: '⏱ Snooze 5',
  skip: 'Skip',
  skipWhy: 'Quick — why skip?',
  dismissAria: 'Dismiss',
  skipOptions: {
    'in-flow': "I'm in flow — quiet for 30 min",
    'just-took': 'Just took a break',
    'bad-timing': 'Bad timing',
    annoyed: 'This message annoyed me'
  }
}

const KO: Strings = {
  metaWithApp: (min, app) => `${app}에서 ${min}분째`,
  metaWithoutApp: (min) => `${min}분째 작업 중`,
  exerciseTitle: '30초 스트레칭',
  exerciseSub: '(애니메이션 데모는 v0.2에)',
  take: '✓ 쉴게',
  snooze: '⏱ 5분 후',
  skip: '건너뛰기',
  skipWhy: '잠깐 — 왜 건너뛸까?',
  dismissAria: '닫기',
  skipOptions: {
    'in-flow': '지금 집중 중 — 30분만 조용히',
    'just-took': '방금 쉬었어',
    'bad-timing': '지금은 안 돼',
    annoyed: '이 메시지 별로야'
  }
}

export function getStrings(): Strings {
  const raw = navigator.language || 'en'
  const base = raw.split('-')[0].toLowerCase()
  switch (base) {
    case 'ko':
      return KO
    default:
      return EN
  }
}
