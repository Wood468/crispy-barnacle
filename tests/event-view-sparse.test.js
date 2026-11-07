/* Regression: sparse future-event placeholders must not create empty navigation sections. */
const assert = require('node:assert/strict');
const { project } = require('../public/event-view.js');
const event = {
  schemaVersion: 1, eventId: 'future-test', family: 'other',
  encounters: [null, {}, {species: 'Pikachu'}],
  bonuses: [null, {}], research: [null, {}], passes: [undefined],
  tickets: [null, {title: 'Ticket'}], activities: [null, {}]
};
const sections = project(event).sections;
assert.deepEqual(sections.map(section => section.key), ['overview', 'encounters', 'tickets']);
assert.equal(sections.find(section => section.key === 'encounters').count, 1);
assert.equal(sections.find(section => section.key === 'tickets').count, 1);
assert.deepEqual(project({...event, encounters: [], tickets: []}).sections.map(section => section.key), ['overview']);
console.log('PASS sparse future-event section projection');
