'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {project} = require('../public/event-view.js');

test('empty activity schedules never create phantom navigation sections', () => {
  const event = {
    schemaVersion: 1, eventId: 'synthetic-future-event', family: 'other',
    activities: [
      {presentation: 'rotation', schedule: {}},
      {presentation: 'schedule', schedule: {}},
      {presentation: 'research', schedule: {}},
      {presentation: 'ticket', schedule: {}},
      {presentation: 'rotation', schedule: null},
      {presentation: 'rotation', schedule: {start: '2027-01-01T09:00:00'}},
      {presentation: 'schedule', schedule: {start: '2027-01-01T10:00:00'}},
      {presentation: 'research', schedule: {start: '2027-01-01T11:00:00'}}
    ],
    encounters: [], bonuses: [], research: [], passes: [], tickets: []
  };
  const sections = project(event).sections;
  assert.deepEqual(sections.map(s => [s.key, s.count]), [
    ['overview', 1], ['rotations', 1], ['schedule', 1], ['research', 1]
  ]);
});
