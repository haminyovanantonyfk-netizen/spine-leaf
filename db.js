/* SpineLeaf — local storage (IndexedDB). Everything stays on this device.
   books: { id, title, tags:[], favorite, createdAt, updatedAt, pageIds:[],
            readPos:{page,sent}, listenPos:{page,sent} }
   pages: { id, bookId, blob (processed JPEG), origBlob, text, words, ocrDone, srcText } */
'use strict';
const SLDB = (() => {
  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('spineleaf', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('pages', { keyPath: 'id' });
        db.createObjectStore('trash', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out._v !== undefined ? out._v : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  }
  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function put(store, val) { const db = await open(); return reqP(db.transaction(store, 'readwrite').objectStore(store).put(val)); }
  async function get(store, key) { const db = await open(); return reqP(db.transaction(store, 'readonly').objectStore(store).get(key)); }
  async function del(store, key) { const db = await open(); return reqP(db.transaction(store, 'readwrite').objectStore(store).delete(key)); }
  async function all(store) { const db = await open(); return reqP(db.transaction(store, 'readonly').objectStore(store).getAll()); }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

  async function createBook(title) {
    const book = { id: uid(), title: title || 'Untitled book', tags: [], favorite: false,
      createdAt: Date.now(), updatedAt: Date.now(), pageIds: [],
      readPos: { page: 0, sent: 0 }, listenPos: { page: 0, sent: 0 } };
    await put('books', book);
    return book;
  }
  async function saveBook(book) { book.updatedAt = Date.now(); await put('books', book); return book; }
  async function getBook(id) { return get('books', id); }
  async function listBooks() { const b = await all('books'); return b.sort((a, b) => b.updatedAt - a.updatedAt); }
  async function deleteBook(id) {
    const book = await getBook(id);
    if (!book) return;
    for (const pid of book.pageIds) await del('pages', pid);
    await put('trash', { id: book.id, kind: 'book', book, deletedAt: Date.now() });
    await del('books', id);
  }
  async function addPage(bookId, data) {
    const book = await getBook(bookId);
    if (!book) throw new Error('Book not found');
    const page = Object.assign({ id: uid(), bookId, blob: null, origBlob: null, text: '', words: null, ocrDone: false, srcText: false }, data);
    await put('pages', page);
    book.pageIds.push(page.id);
    await saveBook(book);
    return page;
  }
  async function getPage(id) { return get('pages', id); }
  async function savePage(page) { await put('pages', page); return page; }
  async function getPages(book) {
    const out = [];
    for (const pid of book.pageIds) { const p = await get('pages', pid); if (p) out.push(p); }
    return out;
  }
  async function deletePage(bookId, pageId) {
    const book = await getBook(bookId);
    if (book) { book.pageIds = book.pageIds.filter(p => p !== pageId); await saveBook(book); }
    await del('pages', pageId);
  }
  async function storageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    }
    return { usage: 0, quota: 0 };
  }
  return { uid, createBook, saveBook, getBook, listBooks, deleteBook, addPage, getPage, savePage, getPages, deletePage, storageEstimate, _all: all, _put: put, _del: del, _get: get };
})();
