import { isObject } from "./is-object";

/**
 * 观察 value 的变化，并在变化时调用 callback
 * @param value 
 * @param callback 
 * @returns 
 */
export const observe = (value: any, callback: (property: string | symbol, newValue: any) => void) => {
    return new Proxy(value, {
        get: (target, p) => {
            let val = target[p];
            if (isObject(val)) {
                val = observe(val, callback); // 递归观察子对象时传递回调
            }
            return val;
        },
        set: (target, p, val) => {
            if (target[p] !== val) {
                target[p] = val;
                callback(p, val); // 调用传入的回调函数，并传入属性名和新值
            }
            return true;
        },
    });
}