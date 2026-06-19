// Verified against UE source:
//   Engine/Source/Runtime/Core/Public/Internationalization/TextLocalizationResourceVersion.h
//   Engine/Source/Runtime/Core/Private/Internationalization/TextLocalizationResource.cpp
//   Engine/Source/Runtime/Core/Private/Internationalization/TextKey.cpp
//
// FString length is int32: positive = ANSI/Latin-1, negative = UTF-16LE; |length| includes trailing \0.

import * as fs from 'fs';

const LOC_RES_MAGIC = Buffer.from([0x0e, 0x14, 0x74, 0x75, 0x67, 0x4a, 0x03, 0xfc, 0x4a, 0x15, 0x90, 0x9d, 0xc3, 0x37, 0x7f, 0x1b]);

const Version = Object.freeze({
  Legacy: 0,
  Compact: 1,
  Optimized_CRC32: 2,
  Optimized_CityHash64_UTF16: 3,
  Latest: 3,
});

const INDEX_NONE = -1;

export type LocresTable = Record<string, Record<string, string>>;

export interface LocresFile {
  version: number;
  namespaceCount: number;
  stringsCount: number;
  table: LocresTable;
}

class Reader {
  private buf: Buffer;
  public pos = 0;
  constructor(buf: Buffer) {
    this.buf = buf;
  }
  u8(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  bytes(n: number): Buffer {
    const v = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  seek(p: number | bigint): void {
    this.pos = Number(p);
  }
  bufferLength(): number {
    return this.buf.length;
  }
  fstring(): string {
    const saveNum = this.i32();
    if (saveNum === 0) return '';
    if (saveNum > 0) {
      const s = this.buf.toString('latin1', this.pos, this.pos + saveNum - 1);
      this.pos += saveNum;
      return s;
    } else {
      const codeUnits = -saveNum;
      const byteLen = codeUnits * 2;
      const s = this.buf.toString('utf16le', this.pos, this.pos + byteLen - 2);
      this.pos += byteLen;
      return s;
    }
  }
}

export function parseLocres(filePath: string): LocresFile {
  const buf = fs.readFileSync(filePath);
  const r = new Reader(buf);

  let version: number = Version.Legacy;
  if (r.bufferLength() >= 16) {
    const magic = r.bytes(16);
    if (magic.equals(LOC_RES_MAGIC)) {
      version = r.u8();
    } else {
      r.seek(0);
    }
  }
  if (version > Version.Latest) {
    throw new Error(`LocRes version ${version} is newer than supported (${Version.Latest})`);
  }

  let strings: string[] = [];
  if (version >= Version.Compact) {
    const lutOffset = r.i64();
    if (lutOffset !== BigInt(INDEX_NONE)) {
      const savedPos = r.pos;
      r.seek(lutOffset);
      const count = r.u32();
      strings = new Array<string>(count);
      for (let i = 0; i < count; i++) {
        const s = r.fstring();
        if (version >= Version.Optimized_CRC32) {
          r.i32(); // RefCount, ignored
        }
        strings[i] = s;
      }
      r.seek(savedPos);
    }
  }

  if (version >= Version.Optimized_CRC32) {
    r.u32(); // EntriesCount, ignored
  }

  const namespaceCount = r.u32();
  const table: LocresTable = {};
  for (let i = 0; i < namespaceCount; i++) {
    if (version >= Version.Optimized_CRC32) r.u32(); // namespace hash
    const ns = r.fstring();
    const keyCount = r.u32();
    const entries: Record<string, string> = {};
    for (let k = 0; k < keyCount; k++) {
      if (version >= Version.Optimized_CRC32) r.u32(); // key hash
      const key = r.fstring();
      if (version >= Version.Compact) {
        r.u32(); // source string hash (v1+ only)
        const idx = r.i32();
        entries[key] = idx >= 0 && idx < strings.length ? strings[idx] : '';
      } else {
        entries[key] = r.fstring();
      }
    }
    table[ns] = entries;
  }

  return { version, namespaceCount, stringsCount: strings.length, table };
}
