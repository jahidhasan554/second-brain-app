import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

function u32(n){const b=Buffer.allocUnsafe(4);b.writeUInt32BE(n>>>0);return b;}
function crc32(buf){
  const t=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c;}
  let crc=0xFFFFFFFF;
  for(const b of buf)crc=t[(crc^b)&0xFF]^(crc>>>8);
  return(crc^0xFFFFFFFF)>>>0;
}
function chunk(type,data){
  const t=Buffer.from(type),c=Buffer.concat([t,data]);
  return Buffer.concat([u32(data.length),c,u32(crc32(c))]);
}
function makePNG(size){
  const cx=size/2,cy=size/2,outerR=size*.43,innerR=size*.25,rowLen=size*4+1;
  const raw=Buffer.allocUnsafe(rowLen*size);
  for(let y=0;y<size;y++){
    raw[y*rowLen]=0;
    for(let x=0;x<size;x++){
      const off=y*rowLen+1+x*4,dx=x-cx,dy=y-cy,d2=dx*dx+dy*dy,dist=Math.sqrt(d2);
      // warm white bg
      let r=250,g=249,b=247;
      // orange ring
      if(d2<outerR*outerR){r=249;g=115;b=22;}
      // light inner
      if(d2<innerR*innerR){r=255;g=255;b=255;}
      // fold lines
      if(dist>innerR&&dist<outerR&&(Math.abs(dy-size*.08)<1.5||Math.abs(dy+size*.08)<1.5)){r=250;g=249;b=247;}
      raw[off]=r;raw[off+1]=g;raw[off+2]=b;raw[off+3]=255;
    }
  }
  const ihdr=Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
  ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))
  ]);
}
for(const size of [192,512]){
  writeFileSync(`./public/icon-${size}.png`,makePNG(size));
  console.log(`✅  public/icon-${size}.png  (${size}×${size})`);
}
console.log('\nIcons ready!');
