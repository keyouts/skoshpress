'use strict';
// Booklet Ordering
                                                                                        
                                                        
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkoshPressBooklet = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  function sheets(pageCount) {
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 700) throw new Error('Invalid booklet page count.');
    const padded = Math.ceil(pageCount / 4) * 4;
    const pages = [];
    for (let sheet = 0; sheet < padded / 4; sheet++) {
                                                                                        
      pages.push([padded - 1 - sheet * 2, sheet * 2]);
      pages.push([sheet * 2 + 1, padded - 2 - sheet * 2]);
    }
    return pages.map(side => side.map(i => i < pageCount ? i : null));
  }
  return { sheets };
});
