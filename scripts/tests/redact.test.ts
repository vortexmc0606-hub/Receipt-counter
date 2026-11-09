import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactText, lineHasPersonalData, describeRedactions } from '../../src/lib/redact';

test('a full card number is blacked out', () => {
  const { text, counts } = redactText('VISA 4111 1111 1111 1111');
  assert.ok(!text.includes('4111'));
  assert.equal(counts.card, 1);
});

test('a masked card number is blacked out', () => {
  const { text, counts } = redactText('CARD **** **** **** 1234');
  assert.ok(!text.includes('1234'));
  assert.equal(counts.card, 1);
});

test('a phone number in the usual shapes is removed', () => {
  for (const phone of ['(972) 555-1234', '972-555-1234', '972.555.1234']) {
    const { text, counts } = redactText(`STORE TEL ${phone}`);
    assert.ok(!text.includes('555'), phone);
    assert.ok(counts.phone >= 1, phone);
  }
});

test('an email address is removed', () => {
  const { text, counts } = redactText('support@shop.example.com');
  assert.ok(!text.includes('@shop.example.com'));
  assert.equal(counts.email, 1);
});

test('a street address is removed', () => {
  const { text, counts } = redactText('150 E Round Rd');
  assert.ok(!/Round Rd/.test(text));
  assert.ok(counts.address >= 1);
});

test('a city/state/zip line is removed', () => {
  const { text, counts } = redactText('Lewisville, TX 75067');
  assert.ok(!text.includes('75067'));
  assert.ok(counts.address >= 1);
});

test('a labelled person name is removed', () => {
  const { text, counts } = redactText('Customer: Mihir Gupta');
  assert.ok(!text.includes('Mihir'));
  assert.equal(counts.name, 1);
});

test('an unlabelled given-name line is removed', () => {
  const { counts } = redactText('John Smith');
  assert.equal(counts.name, 1);
});

test('store names and item lines are left intact', () => {
  const input = 'WALMART SUPERCENTER\nBICYCLE 26IN   $212.00\nTOTAL $307.96';
  const { text, counts } = redactText(input);
  assert.equal(text, input);
  assert.equal(counts.card + counts.phone + counts.email + counts.address + counts.name, 0);
});

test('lineHasPersonalData flags only personal lines', () => {
  assert.equal(lineHasPersonalData('HELMET  $39.99'), false);
  assert.equal(lineHasPersonalData('Tel: 972-555-1234'), true);
});

test('describeRedactions summarises what was removed', () => {
  const { counts } = redactText('4111 1111 1111 1111\n(972) 555-1234');
  const summary = describeRedactions(counts);
  assert.ok(summary && /card number/.test(summary) && /phone number/.test(summary));
});

test('describeRedactions returns null when nothing was removed', () => {
  const { counts } = redactText('WALMART\nTOTAL $10.00');
  assert.equal(describeRedactions(counts), null);
});
