export class ID {
    constructor(id: string) {
        this.id = new Uint8Array(id.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));
    }

    static increment = 0;
    static machine = 0;
    static pid = 0;

    static generateByBrowser(): ID {
        if (!this.machine) {
            let machineID = localStorage.getItem('mongoMachineId');
            let id = this.generate();
            localStorage.setItem('mongoMachineId', this.machine.toString());
            return id;
        } else
            return this.generate();
    }

    static generate(): ID {
        this.machine = this.machine || Math.floor(Math.random() * (16777216));
        let machineStr = this.machine.toString(16);

        this.increment = this.increment || Math.floor(Math.random() * (16777216));
        this.increment = this.increment >= 0xffffff ? 0 : this.increment + 1;
        let incrementStr = this.increment.toString(16);

        this.pid = this.pid || Math.floor(Math.random() * (65536));
        let pidStr = this.pid.toString(16);

        let timestamp = Math.floor(new Date().valueOf() / 1000);
        let timestampStr = timestamp.toString(16);

        let value = '00000000'.substr(0, 8 - timestampStr.length) + timestampStr +
            '000000'.substr(0, 6 - machineStr.length) + machineStr +
            '0000'.substr(0, 4 - pidStr.length) + pidStr +
            '000000'.substr(0, 6 - incrementStr.length) + incrementStr;

        return new ID(value);
    }

    equals(another: ID): boolean {
        return this.toString() == another.toString();
    }

    toString(): string {
        return Array.from(this.id).map(i => ('0' + i.toString(16)).slice(-2)).join('');
    }

    id: Uint8Array;
    _bsontype = 'ObjectID';
}

export function getBsonValue(val: any, seen): any {
    if (val == null || typeof val == "number" || typeof val == "string" || typeof val == "boolean")
        return val;
    else if (typeof val == "function")
        return {"$Func": true};
    else if (Array.isArray(val))
        return val.map(item => getBsonValue(item, seen));
    else if (val instanceof Date)
        return {"$Date": val.toISOString()};
    else if (val instanceof RegExp)
        return {"$RegExp": val.toString()};
    else if (val._bsontype && val._bsontype.toLowerCase() == "objectid")
        return {"$oid": val.toString()};
    else if (seen && seen.has(val))
        return seen.get(val);
    else {
        let newJson = {};
        bson2json(val, newJson, seen);
        return newJson;
    }
}

function bson2json(bson: any, json: any, seen): void {
    if (!seen.has(bson)) {
        seen.set(bson, json);

        for (const key in bson) {
            try {
                json[key] = getBsonValue(bson[key], seen);
            } catch (ex) {
                throw ex;
            }
        }
    }
}

export function stringify(json: any, bson: boolean = false): string {
    if (json == null) return null;

    if (!bson)
        return stringifyCircular(json);
    else {
        let seen = new WeakMap();

        if (Array.isArray(json)) {
            let array = json.map(item => getBsonValue(item, seen));
            return stringifyCircular(array);
        } else if (json._bsontype && json._bsontype.toLowerCase() == "objectid")
            return `{"$oid": "${json}"}`;

        let newJson = {};
        bson2json(json, newJson, seen);
        return stringifyCircular(newJson);
    }
}

export function parse(text: string, bson: boolean = false, oidType: any = ID): any {
    if (!text) return null;
    if (typeof text != "string") {
        return text;
    }

    if (!bson)
        return parseCircular(text);
    else {
        let json = parseCircular(text);
        let seen = new WeakSet();
        return json2bson(json, seen, oidType);
    }
}

export function json2bson(json, seen, oidType): any {
    if (seen.has(json)) return json;
    seen.add(json);

    for (const key in json) {
        let val = json[key];
        if (val == null) continue;
        if (typeof val == "object") {
            if (val.$oid)
                json[key] = new oidType(val.$oid);
            else if (val.$Date || val.$date)
                json[key] = new Date(Date.parse(val.$Date || val.$date));
            else if (val.$RegExp) {
                let match = val.$RegExp.match(/\/(.+)\/(.*)/);
                json[key] = new RegExp(match[1], match[2]);
            } else
                json[key] = json2bson(val, seen, oidType);
        }
    }
    return json;
}

function encode(data, list, seen) {
    let stored, key, value, i, l;
    let seenIndex = seen.get(data);
    if (seenIndex != null) return seenIndex;
    let index = list.length;
    let proto = Object.prototype.toString.call(data);
    if (proto === '[object Object]') {
        stored = {};
        seen.set(data, index);
        list.push(stored);
        let keys = Object.keys(data);
        for (i = 0, l = keys.length; i < l; i++) {
            key = keys[i];
            value = data[key];
            stored[key] = encode(value, list, seen);
        }
    } else if (proto === '[object Array]') {
        stored = [];
        seen.set(data, index);
        list.push(stored);
        for (i = 0, l = data.length; i < l; i++) {
            value = data[i];
            stored[i] = encode(value, list, seen);
        }
    } else {
        list.push(data);
    }
    return index
}

function decode(list) {
    let i = list.length;
    let j, k, data, key, value, proto;
    while (i--) {
        data = list[i];
        proto = Object.prototype.toString.call(data);
        if (proto === '[object Object]') {
            let keys = Object.keys(data);
            for (j = 0, k = keys.length; j < k; j++) {
                key = keys[j];
                value = list[data[key]];
                data[key] = value
            }
        } else if (proto === '[object Array]') {
            for (j = 0, k = data.length; j < k; j++) {
                value = list[data[j]];
                data[j] = value
            }
        }
    }
}

function stringifyCircular(data, space?) {
    try {
        return arguments.length === 1 ? JSON.stringify(data) : JSON.stringify(data, space);
    } catch (e) {
        let list = [];
        encode(data, list, new Map());
        return space ? ' ' + JSON.stringify(list, null, space) : ' ' + JSON.stringify(list);
    }
}

function parseCircular(data: string): any {
    let hasCircular = /^\s/.test(data);
    if (!hasCircular) {
        return JSON.parse(data);
    } else {
        let list = JSON.parse(data);
        decode(list);
        return list[0]
    }
}
