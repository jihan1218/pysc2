//Named numpy arrays for easier access to the observation data.

/*
https://docs.scipy.org/doc/numpy/user/basics.rec.html are not enough since they
actually change the type and don't interoperate well with tensorflow.
*/

const path = require('path')
const Enum = require('python-enum')
const np = require(path.resolve(__dirname, './numpy.js'))
const pythonUtils = require(path.resolve(__dirname, './pythonUtils.js'))
const { isinstance } = pythonUtils
Array.prototype.valueAt = function valueAt() { //eslint-disable-line
  let value = this
  let args = arguments //eslint-disable-line
  if (args[0] === null) {
    return this.getProxy(this)
  }
  if (args[0]._named_array_values) {
    args[0] = args[0]._named_array_values
  }
  if (Array.isArray(args[0])) {
    args = args[0]
    const results = []
    args.forEach((ind) => {
      results.push(this[ind])
    })
    return this.getProxy(results, true)
  }
  for (let i = 0; i < args.length; i++) {
    value = value[args[i]]
  }
  return value
}
Array.prototype.where = function where(conditionFunc, start = this._named_array_values, results = [], init = true) { //eslint-disable-line
  start.forEach((ele, index) => {
    if (Array.isArray(ele)) {
      const temp = this.where(conditionFunc, ele, results, false)
      results.concat(temp)
      // results = results.concat(this.where(conditionFunc, ele, results, false))
      return
    }
    if (conditionFunc(ele, index)) {
      results.push(ele)
    }
  })
  if (init === false) {
    return results
  }
  return this.getProxy(results, true)
}
function assign(values, name, keyPathArray) {
  let value = values
  let parent
  let index
  let lookUpIndex
  if (name === null || name === undefined) {
    return
  }
  while (keyPathArray.length) {
    if (keyPathArray.length === 1) {
      parent = value
    }
    index = keyPathArray.shift()
    lookUpIndex = index
    value = value[index]
  }
  Object.defineProperty(parent, name, {
    get: function() { return parent[lookUpIndex] },
    set: function(val) { parent[lookUpIndex] = val; return val }
  })
}
function unpack(values, names, nameIndex = 0, keyPathArray = []) {
  //sanitize input
  if (isinstance(names, Enum.EnumMeta)) {
    names = names.member_names_
  } else if (names.contructor && names.constructor._fields) {
    names = names.constructor._fields
  } else if (!Array.isArray(names)) {
    names = Object.keys(names)
  }
  let nameList = names[nameIndex]
  if (nameList === undefined) {
    return
  }
  if (nameList === null) {
    nameList = names
  }
  if (typeof nameList === 'string') {
    nameList = names
  } else if (nameList.constructor && nameList.constructor._fields) {
    nameList = nameList.constructor._fields
  } else if (isinstance(nameList, Enum.EnumMeta)) {
    nameList = nameList.member_names_
  }
  try {
    nameList.forEach((name, index) => {
      assign(values, name, keyPathArray.concat(index))
      unpack(values, names, nameIndex + 1, keyPathArray.concat(index))
    })
  } catch (err) {
    console.log('nameList: ', nameList, ' nameIndex: ', nameIndex, '\nerr: ', err)
  }
}

class NamedDict {
  //A dict where you can use `d["element"]` or `d.element`.//
  constructor(kwargs) {
    if (!kwargs) {
      return
    }
    Object.keys(kwargs).forEach((key) => {
      this[key] = kwargs[key]
    })
  }
}
class NamedNumpyArray extends Array {// extends np.ndarray:
  /*A subclass of ndarray that lets you give names to indices.

  This is a normal ndarray in the sense that you can always index by numbers and
  slices, though elipses don't work. Also, all elements have the same type,
  unlike a record array.

  Names should be a list of names per dimension in the ndarray shape. The names
  should be a list or tuple of strings, a namedtuple class (with names taken
  from _fields), or an IntEnum. Alternatively if you don't want to give a name
  to a particular dimension, use None. If your array only has one dimension, the
  second level of list can be skipped.


    Jihan & Ryan - Documentation notes:

     var foo = named_array.NamedNumpyArray([1, 3, 6], ["a", "b", "c"])
                col
    dimension    0
       a         1
       b         3
       c         6

    usage: foo.a => 1, foo.b => 3, foo.c => 6

      bar = named_array.NamedNumpyArray([[1, 3], [6, 8]], [["a", "b"], None])
                col   col
    dimension    0     1
       a (0)     1     3
       b (1)     6     8

    usage: bar.a => [1,3], bar.a[0] => 1, bar.a[1] => 3
    usage: bar.b => [6,8], bar.b[0] => 6, bar.b[1] => 8

     baz = named_array.NamedNumpyArray([[1, 3], [6, 8]], [None, ["a", "b"]])

                col           col
    dimension    a             b
    None (0)     1             3
    None (1)     6             8

    usage: bar[0] => [1,3], bar[0].a => 1, bar[0].a => 3
    usage: bar[1] => [6,8], bar[0].b => 6, bar[1].b => 8

  Look at the tests for more examples including using enums and named tuples.
  */
  constructor(values, names) {
    super(...values)
    if (isinstance(names, Enum.EnumMeta)) {
      names = names.member_names_
    } else if (names.contructor && names.constructor._fields) {
      names = names.constructor._fields
    } else if (!Array.isArray(names)) {
      names = Object.keys(names)
    }
    this.__pickleArgs = [values, names]
    this.tensor = np.tensor(values)
    this.shape = this.tensor.shape
    if (this.shape.length === 0) {
      throw new Error('ValueError: Scalar arrays are unsupported')
    }
    if (this.shape.length === 1) {
      if (this.shape[0] === 0 && names && names[0] === null) {
        // Support arrays of length 0.
        names = [null]
      } else {
        // Allow just a single dimension if the array is also single dimension.
        try {
          if (names.length > 1) {
            names = [names]
          }
        } catch (err) { // len of a namedtuple is a TypeError
          names = [names]
        }
      }
    }

    // Validate names!
    if (!isinstance(names, Array) || names.length !== this.shape.length) {
      throw new Error(`ValueError: Names must be a list of length equal to the array shape: ${names.length} != ${this.shape.length}.`)
    }
    let only_none = this.shape[0] > 0
    Object.keys(names).forEach((key, i) => {
      let o = names[key]
      if (o === null) {
        // skip
      } else {
        only_none = false
        if (isinstance(o, Enum.EnumMeta)) {
          o.member_names_.forEach((n, j) => {
            if (j != o[n]) {
              throw new Error('ValueError: Enum has holes or doesn\'t start from 0.')
            }
          })
          o = o.member_names_
        } else if (o.constructor && o.constructor._fields) {
          o = o.constructor._fields
        } else if (isinstance(o, Array)) {
          o.forEach((n) => {
            if (typeof (n) !== 'string') {
              throw new Error(`ValueError: Bad name, must be a list of strings not: ${JSON.stringify(o)}`)
            }
          })
        } else {
          throw new Error('Bad names. Must be None, a list of strings, a namedtuple, or Intenum.')
        }
        if (this.shape[i] !== o.length) {
          throw new Error(`ValueError: Wrong number of names in dimension ${i}. Got ${o.length}, expected ${this.shape[i]}.`)
        }
      }
    })

    if (only_none) {
      throw new Error('No names given. Use a normal numpy.ndarray instead.')
    }
    const copy = values.map((e) => e)
    this._named_array_values = copy
    // Finally convert to a NamedNumpyArray.
    unpack(this, names)
  }

  valueAt() {
    let value = this
    let args = arguments //eslint-disable-line
    if (args[0] === null) {
      return this.getProxy(this)
    }
    if (args[0]._named_array_values) {
      args[0] = args[0]._named_array_values
    }
    if (Array.isArray(args[0])) {
      args = args[0]
      const results = []
      args.forEach((ind) => {
        results.push(this[ind])
      })
      return this.getProxy(results, true)
    }
    for (let i = 0; i < args.length; i++) {
      value = value[args[i]]
    }
    return value
  }

  where(conditionFunc, start = this._named_array_values, results = [], init = true) {
    start.forEach((ele, index) => {
      if (Array.isArray(ele)) {
        const temp = this.where(conditionFunc, ele, results, false)
        results.concat(temp)
        // NOTE: below will NOT work
        // results = results.concat(this.where(conditionFunc, ele, results, false))
        return
      }
      if (conditionFunc(ele, index)) {
        results.push(ele)
      }
    })
    if (init === false) {
      return results
    }
    return this.getProxy(results, true)
  }

  slice() {
    return this.getProxy(this._named_array_values.slice(...arguments), true) //eslint-disable-line
  }

  getProxy() { //eslint-disable-line
    return arguments //eslint-disable-line
  }

  pickle() {
    return JSON.stringify(this.__pickleArgs)
  }
}

function getNamedNumpyArray(values, names) {
  let returnVal
  function getProxy(thing, override) {
    return new Proxy(thing, {
      get: (target, name) => {
        if (name === Symbol.iterator) {
          return target[Symbol.iterator].bind(target)
        }
        if (name === '_named_array_values') {
          return target._named_array_values
        }
        if (name === 'length') {
          return target[name]
        }
        let val
        if (typeof name === 'string' && Number.isInteger(Number(name))) {
          name = Number(name)
          if (name >= 0) {
            val = target[name]
          } else {
            val = target[target.length + name]
          }
          // gather
        } else if (name === 'undefined' || name === 'null') {
          val = [target]
        } else if (override) {
          val = returnVal[name]
        } else {
          val = target[name]
        }
        if (Array.isArray(val)) {
          return getProxy(val)
        }
        return val
      },
      set(target, key, value) {
        target[key] = value
        return value
      },
      ownKeys: (target) => Object.keys(target).concat(['length']),
      getOwnPropertyDescriptor: function(target, key) {
        if (key === 'length') {
          return Object.getOwnPropertyDescriptor(target, key)
        }
        if (key === 'extends') {
          return { value: this.get(target, key), enumerable: false, configurable: true }
        }
        return { value: this.get(target, key), enumerable: true, configurable: true }
      }
    })
  }
  const obj = new NamedNumpyArray(values, names) //eslint-disable-line
  obj.getProxy = getProxy
  returnVal = getProxy(obj)
  return returnVal
}
module.exports = {
  NamedDict,
  NamedNumpyArray: getNamedNumpyArray,
}
