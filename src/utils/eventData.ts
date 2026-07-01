// Ported from gmx-subgraph/synthetics-stats/src/utils/eventData.ts
//
// In the subgraph the EventLog `eventData` tuple was decoded into typed structs.
// In Envio (v3) the same tuple decodes into a numeric-keyed object:
//
//   eventData[0] = addressItems  { 0: items, 1: arrayItems }   value: string (address)
//   eventData[1] = uintItems     { 0: items, 1: arrayItems }   value: bigint
//   eventData[2] = intItems      { 0: items, 1: arrayItems }   value: bigint
//   eventData[3] = boolItems     { 0: items, 1: arrayItems }   value: boolean
//   eventData[4] = bytes32Items  { 0: items, 1: arrayItems }   value: string (hex)
//   eventData[5] = bytesItems    { 0: items, 1: arrayItems }   value: string (hex)
//   eventData[6] = stringItems   { 0: items, 1: arrayItems }   value: string
//
// where each `items`/`arrayItems` element is { 0: key, 1: value }.

type Item<T> = { readonly 0: string; readonly 1: T };
type ItemGroup<T> = {
  readonly 0: ReadonlyArray<Item<T>>;
  readonly 1: ReadonlyArray<Item<ReadonlyArray<T>>>;
};

export type RawEventData = {
  readonly 0: ItemGroup<string>; // addressItems
  readonly 1: ItemGroup<bigint>; // uintItems
  readonly 2: ItemGroup<bigint>; // intItems
  readonly 3: ItemGroup<boolean>; // boolItems
  readonly 4: ItemGroup<string>; // bytes32Items
  readonly 5: ItemGroup<string>; // bytesItems
  readonly 6: ItemGroup<string>; // stringItems
};

function getItemByKey<T>(items: ReadonlyArray<Item<T>>, key: string): T | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item[0] == key) {
      return item[1];
    }
  }
  return null;
}

export class EventData {
  constructor(public rawData: RawEventData) {}

  getAddressItem(key: string): string | null {
    return getItemByKey<string>(this.rawData[0][0], key);
  }

  getAddressItemString(key: string): string | null {
    let item = this.getAddressItem(key);
    if (item != null) {
      return item.toLowerCase();
    }
    return null;
  }

  getAddressArrayItem(key: string): Array<string> | null {
    let items = getItemByKey<ReadonlyArray<string>>(this.rawData[0][1], key);
    return items != null ? items.slice() : null;
  }

  getAddressArrayItemString(key: string): Array<string> | null {
    let items = this.getAddressArrayItem(key);
    if (items != null) {
      let stringsArray = new Array<string>(items.length);
      for (let i = 0; i < items.length; i++) {
        stringsArray[i] = items[i]!.toLowerCase();
      }
      return stringsArray;
    }
    return null;
  }

  getStringItem(key: string): string | null {
    return getItemByKey<string>(this.rawData[6][0], key);
  }

  getStringArrayItem(key: string): Array<string> | null {
    let items = getItemByKey<ReadonlyArray<string>>(this.rawData[6][1], key);
    return items != null ? items.slice() : null;
  }

  // Missing numeric fields default to 0n. GMX's event field-set has changed over
  // time (fields added/renamed across contract versions), so an older or newer
  // event may not carry every key the mapping reads. The subgraph reads these
  // with a non-null assertion, which in AssemblyScript effectively yields 0 for
  // an absent key (and the schema even documents "no such field" cases). Use
  // getUintItemOrNull when the caller genuinely needs to distinguish absence.
  getUintItem(key: string): bigint {
    return getItemByKey<bigint>(this.rawData[1][0], key) ?? 0n;
  }

  getUintItemOrNull(key: string): bigint | null {
    return getItemByKey<bigint>(this.rawData[1][0], key);
  }

  getUintArrayItem(key: string): Array<bigint> | null {
    let items = getItemByKey<ReadonlyArray<bigint>>(this.rawData[1][1], key);
    return items != null ? items.slice() : null;
  }

  getIntItem(key: string): bigint {
    return getItemByKey<bigint>(this.rawData[2][0], key) ?? 0n;
  }

  getIntItemOrNull(key: string): bigint | null {
    return getItemByKey<bigint>(this.rawData[2][0], key);
  }

  getIntArrayItem(key: string): Array<bigint> | null {
    let items = getItemByKey<ReadonlyArray<bigint>>(this.rawData[2][1], key);
    return items != null ? items.slice() : null;
  }

  // bytes32/bytes values arrive as hex strings; callers previously did `.toHexString()`,
  // so these getters already return the hex string (lowercased for id parity).
  getBytesItem(key: string): string | null {
    let item = getItemByKey<string>(this.rawData[5][0], key);
    return item != null ? item.toLowerCase() : null;
  }

  getBytesArrayItem(key: string): Array<string> | null {
    let items = getItemByKey<ReadonlyArray<string>>(this.rawData[5][1], key);
    if (items == null) return null;
    return items.map((i) => i.toLowerCase());
  }

  getBytes32Item(key: string): string | null {
    let item = getItemByKey<string>(this.rawData[4][0], key);
    return item != null ? item.toLowerCase() : null;
  }

  getBytes32ArrayItem(key: string): Array<string> | null {
    let items = getItemByKey<ReadonlyArray<string>>(this.rawData[4][1], key);
    if (items == null) return null;
    return items.map((i) => i.toLowerCase());
  }

  // boolean type is not nullable in the original; returns false if the key is not found
  getBoolItem(key: string): boolean {
    let item = getItemByKey<boolean>(this.rawData[3][0], key);
    return item != null ? item : false;
  }
}
