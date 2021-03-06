export class ID {
    constructor(id: string) {
        this.id = new Uint8Array(id.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));
    }

    static increment = 0;
    static machine = 0;
    static pid = 0;

    static generateByBrowser(): ID {
        if (!this.machine) {
            // let machineID = localStorage.getItem('mongoMachineId');
            const id = this.generate();
            localStorage.setItem("mongoMachineId", this.machine.toString());
            return id;
        } else
            return this.generate();
    }

    static generate(): ID {
        this.machine = this.machine || Math.floor(Math.random() * (16777216));
        const machineStr = this.machine.toString(16);

        this.increment = this.increment || Math.floor(Math.random() * (16777216));
        this.increment = this.increment >= 0xffffff ? 0 : this.increment + 1;
        const incrementStr = this.increment.toString(16);

        this.pid = this.pid || Math.floor(Math.random() * (65536));
        const pidStr = this.pid.toString(16);

        const timestamp = Math.floor(new Date().valueOf() / 1000);
        const timestampStr = timestamp.toString(16);

        const value = "00000000".substr(0, 8 - timestampStr.length) + timestampStr +
            "000000".substr(0, 6 - machineStr.length) + machineStr +
            "0000".substr(0, 4 - pidStr.length) + pidStr +
            "000000".substr(0, 6 - incrementStr.length) + incrementStr;

        return new ID(value);
    }

    equals(another: ID): boolean {
        return this.toString() === another.toString();
    }

    toString(): string {
        return Array.from(this.id).map(i => ("0" + i.toString(16)).slice(-2)).join("");
    }

    id: Uint8Array;
    _bsontype = "ObjectID";
}

export function getBsonValue(val: any, seen): any {
    if (val == null || typeof val === "number" || typeof val === "string" || typeof val === "boolean")
        return val;
    else if (typeof val === "function")
        return {"$Func": true};
    else if (Array.isArray(val))
        return val.map(item => getBsonValue(item, seen));
    else if (val instanceof Date)
        return {"$Date": val.toISOString()};
    else if (val instanceof RegExp)
        return {"$RegExp": val.toString()};
    else if (val._bsontype && val._bsontype.toLowerCase() === "objectid")
        return {"$oid": val.toString()};
    else if (seen && seen.has(val))
        return seen.get(val);
    else {
        const newJson = {};
        bson2json(val, newJson, seen);
        return newJson;
    }
}

function bson2json(bson: any, json: any, seen): void {
    if (!seen.has(bson)) {
        seen.set(bson, json);

        for (const key in bson) {
            if (Object.prototype.hasOwnProperty.call(bson, key)) {
                json[key] = getBsonValue(bson[key], seen);
            }
        }
    }
}

export function stringify(json: any, bson = false): string {
    if (json == null) return null;

    if (!bson)
        return stringifyCircular(json);
    else {
        const seen = new WeakMap();

        if (Array.isArray(json)) {
            const array = json.map(item => getBsonValue(item, seen));
            return stringifyCircular(array);
        } else if (json._bsontype && json._bsontype.toLowerCase() === "objectid")
            return `{"$oid": "${json}"}`;

        const newJson = {};
        bson2json(json, newJson, seen);
        return stringifyCircular(newJson);
    }
}

export function parse(text: string, bson = false, oidType: any = ID): any {
    if (!text) return null;
    if (typeof text !== "string") {
        return text;
    }

    if (!bson)
        return parseCircular(text);
    else {
        const json = parseCircular(text);
        const seen = new WeakSet();
        return json2bson(json, seen, oidType);
    }
}

export function json2bson(json, seen, oidType: any): any {
    if (seen.has(json)) return json;
    seen.add(json);

    for (const key in json) {
        if (Object.prototype.hasOwnProperty.call(json, key)) {
            const val = json[key];
            if (val == null) continue;
            if (typeof val === "object") {
                if (val.$oid)
                    json[key] = new oidType(val.$oid);
                else if (val.$Date || val.$date)
                    json[key] = new Date(Date.parse(val.$Date || val.$date));
                else if (val.$RegExp) {
                    const match = val.$RegExp.match(/\/(.+)\/(.*)/);
                    json[key] = new RegExp(match[1], match[2]);
                } else
                    json[key] = json2bson(val, seen, oidType);
            }
        }
    }
    return json;
}

function encode(data, list, seen) {
    const seenIndex = seen.get(data);
    if (seenIndex != null) return seenIndex;
    const index = list.length;
    const proto = Object.prototype.toString.call(data);
    if (proto === "[object Object]") {
        const stored = {};
        seen.set(data, index);
        list.push(stored);
        const keys = Object.keys(data);
        for (let i = 0, l = keys.length; i < l; i++) {
            const key = keys[i];
            const value = data[key];
            stored[key] = encode(value, list, seen);
        }
    } else if (proto === "[object Array]") {
        const stored = [];
        seen.set(data, index);
        list.push(stored);
        for (let i = 0, l = data.length; i < l; i++) {
            const value = data[i];
            stored[i] = encode(value, list, seen);
        }
    } else {
        list.push(data);
    }
    return index;
}

function decode(list) {
    let i = list.length;
    while (i--) {
        const data = list[i];
        const proto = Object.prototype.toString.call(data);
        if (proto === "[object Object]") {
            const keys = Object.keys(data);
            for (let j = 0, k = keys.length; j < k; j++) {
                const key = keys[j];
                const value = list[data[key]];
                data[key] = value;
            }
        } else if (proto === "[object Array]") {
            for (let j = 0, k = data.length; j < k; j++) {
                const value = list[data[j]];
                data[j] = value;
            }
        }
    }
}

function stringifyCircular(data, space?) {
    try {
        return arguments.length === 1 ? JSON.stringify(data) : JSON.stringify(data, space);
    } catch (e) {
        const list = [];
        encode(data, list, new Map());
        return space ? " " + JSON.stringify(list, null, space) : " " + JSON.stringify(list);
    }
}

function parseCircular(data: string): any {
    const hasCircular = /^\s/.test(data);
    if (!hasCircular) {
        return JSON.parse(data);
    } else {
        const list = JSON.parse(data);
        decode(list);
        return list[0];
    }
}
