import { describe, expect, it } from 'vitest'

import { buildWorkLog, emptyWorkLogForm } from './workLogForm'

describe('buildWorkLog', () => {
  it('needs text for a note or an issue, trimmed', () => {
    expect(buildWorkLog({ ...emptyWorkLogForm('NOTE'), body: '   ' })).toMatchObject({ ok: false })
    expect(buildWorkLog({ ...emptyWorkLogForm('NOTE'), body: ' Gate locked at 9 ' })).toEqual({ ok: true, input: { kind: 'NOTE', body: 'Gate locked at 9' } })
    expect(buildWorkLog({ ...emptyWorkLogForm('ISSUE'), body: 'Broken light' })).toEqual({ ok: true, input: { kind: 'ISSUE', body: 'Broken light' } })
  })

  it('refuses text over 4000 characters', () => {
    expect(buildWorkLog({ ...emptyWorkLogForm('NOTE'), body: 'x'.repeat(4001) })).toMatchObject({ ok: false })
  })

  it('needs an uploaded photo; the caption is optional', () => {
    expect(buildWorkLog(emptyWorkLogForm('PHOTO'))).toMatchObject({ ok: false })
    expect(buildWorkLog({ ...emptyWorkLogForm('PHOTO'), fileId: 'f1' })).toEqual({ ok: true, input: { kind: 'PHOTO', fileId: 'f1' } })
    expect(buildWorkLog({ ...emptyWorkLogForm('PHOTO'), fileId: 'f1', body: 'Lobby' })).toEqual({ ok: true, input: { kind: 'PHOTO', fileId: 'f1', body: 'Lobby' } })
  })

  it('drops blank checklist rows and needs at least one item', () => {
    expect(buildWorkLog(emptyWorkLogForm('CHECKLIST'))).toMatchObject({ ok: false })
    expect(
      buildWorkLog({
        ...emptyWorkLogForm('CHECKLIST'),
        items: [
          { label: ' Doors ', done: true },
          { label: '', done: false },
          { label: 'Windows', done: false }
        ]
      })
    ).toEqual({ ok: true, input: { kind: 'CHECKLIST', data: { items: [{ label: 'Doors', done: true }, { label: 'Windows', done: false }] } } })
  })

  it('enforces the item limits', () => {
    const many = Array.from({ length: 101 }, (_, index) => ({ label: `Item ${index}`, done: false }))

    expect(buildWorkLog({ ...emptyWorkLogForm('CHECKLIST'), items: many })).toMatchObject({ ok: false })
    expect(buildWorkLog({ ...emptyWorkLogForm('CHECKLIST'), items: [{ label: 'x'.repeat(201), done: false }] })).toMatchObject({ ok: false })
  })
})
