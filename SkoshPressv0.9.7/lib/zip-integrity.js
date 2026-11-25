'use strict';
const CRC_TABLE=(()=>{const a=[];for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);a.push(c>>>0);}return a;})();
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=CRC_TABLE[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
module.exports={crc32};
