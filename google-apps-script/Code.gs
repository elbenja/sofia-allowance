/**
 * Sofia's Allowance: the only door between the web page and this sheet.
 *
 * Reading is open to anyone who has the web-app link.
 * Writing needs a secret key. Only the site's server (/api/sheet on Vercel)
 * knows it: that server checks the parent PIN first, then calls this script
 * with the key. The key is never in the web page.
 *
 * Set the key once: Project Settings > Script Properties > PARENT_PIN,
 * with the same value as `sheet_key` on Vercel. (The property keeps its old
 * name so this script needs no new deployment.)
 */

const COLUMNS = {
  activities: ['id', 'name', 'amount', 'icon', 'tint'],
  entries: ['id', 'date', 'name', 'amount', 'icon', 'tint'],
};

// After this many wrong keys, every write is refused for ten minutes,
// so the key cannot be found by trying them all.
const MAX_WRONG_PINS = 5;
const LOCKOUT_SECONDS = 600;

function doGet() {
  return json({ ok: true, activities: readTab('activities'), entries: readTab('entries') });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad-request' });
  }

  const cache = CacheService.getScriptCache();
  const wrong = Number(cache.get('wrong-pins') || 0);
  if (wrong >= MAX_WRONG_PINS) return json({ ok: false, error: 'locked' });

  const pin = PropertiesService.getScriptProperties().getProperty('PARENT_PIN');
  if (!pin || String(body.pin) !== pin) {
    cache.put('wrong-pins', String(wrong + 1), LOCKOUT_SECONDS);
    return json({ ok: false, error: 'pin' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'check') {
      // The PIN was right; nothing to write.
    } else if (body.action === 'addEntry') {
      tab('entries').appendRow(toRow('entries', body.entry));
    } else if (body.action === 'removeEntry') {
      removeById('entries', body.id);
    } else if (body.action === 'setActivities') {
      replaceRows('activities', body.activities.map(function (a) { return toRow('activities', a); }));
    } else {
      return json({ ok: false, error: 'bad-request' });
    }
  } catch (err) {
    return json({ ok: false, error: 'bad-request' });
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

function tab(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function readTab(name) {
  const zone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const rows = tab(name).getDataRange().getValues().slice(1);
  return rows
    .filter(function (row) { return row[0] !== ''; })
    .map(function (row) {
      const item = {};
      COLUMNS[name].forEach(function (key, i) {
        let value = row[i];
        // Sheets turns 2026-11-22 into a real date; hand it back as text.
        if (value instanceof Date) value = Utilities.formatDate(value, zone, 'yyyy-MM-dd');
        item[key] = key === 'amount' ? Number(value) : String(value);
      });
      return item;
    });
}

// Turns what the page sent into one clean sheet row, or throws.
function toRow(name, item) {
  return COLUMNS[name].map(function (key) {
    if (key === 'amount') {
      const amount = Number(item.amount);
      if (!(amount > 0)) throw new Error('amount');
      return amount;
    }
    if (key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error('date');
    // No leading = + - @, so text can never run as a formula.
    const text = String(item[key] == null ? '' : item[key]).slice(0, 80).replace(/^[=+\-@]+/, '');
    if (!text) throw new Error(key);
    return text;
  });
}

function removeById(name, id) {
  const sheet = tab(name);
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function replaceRows(name, rows) {
  const sheet = tab(name);
  const width = COLUMNS[name].length;
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, width).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
