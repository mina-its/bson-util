"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bson_1 = require("bson");
function stringify(value) {
    value._0 = "";
    const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return { _$: value._0 };
                }
                for (let attr in value) {
                    if (value[attr] && value[attr].constructor == bson_1.ObjectId) {
                        value[attr] = { "$oid": value[attr].toString() };
                    }
                }
                seen.add(value);
            }
            return value;
        };
    };
    const seen = new WeakSet();
    const setKeys = (obj, parentKey) => {
        if (seen.has(obj))
            return;
        seen.add(obj);
        for (let key in obj) {
            let val = obj[key];
            if (!val)
                continue;
            if (typeof val === "object" && val.constructor != bson_1.ObjectId) {
                if (val._0 == null) {
                    val._0 = parentKey + (Array.isArray(obj) ? `[${key}]` : `['${key}']`);
                }
                setKeys(val, val._0);
            }
        }
    };
    setKeys(value, "");
    let str = JSON.stringify(value, getCircularReplacer());
    return str;
}
exports.stringify = stringify;
function parse(str) {
    let json = JSON.parse(str);
    let keys = {};
    const findKeys = (obj) => {
        if (obj && obj._0) {
            keys[obj._0] = obj;
            delete obj._0;
        }
        for (let key in obj) {
            if (typeof obj[key] === "object")
                findKeys(obj[key]);
        }
    };
    const seen = new WeakSet();
    const replaceRef = (obj) => {
        if (seen.has(obj))
            return;
        seen.add(obj);
        for (let key in obj) {
            let val = obj[key];
            if (!val)
                continue;
            if (typeof val === "object" && !val.$oid) {
                if (val._$ == "") {
                    obj[key] = json;
                }
                else if (val._$) {
                    obj[key] = eval('json' + val._$);
                }
                replaceRef(val);
            }
        }
    };
    delete json._0;
    findKeys(json);
    replaceRef(json);
    return json;
}
exports.parse = parse;
//# sourceMappingURL=main.js.map