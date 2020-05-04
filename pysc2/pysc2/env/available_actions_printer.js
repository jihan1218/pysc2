const path = require('path')
const base_evn_wrapper = require(path.resolve(__dirname, './base_evn_wrapper.js'))

class AvailableActionsPrinter extends base_evn_wrapper.base_evn_wrapper {
  constructor(env) {
    super().__init__(env)
    this._seen = set()
    this._action_spec = this._action_spec()[0]
  }
  step(args, kwargs) {
    const all_obs = super.step(args, kwargs)
    Object.keys(all_obs).forEach((key) => {
      const obs = all_obs[key]
      Object.keys(obs.observation["available_actions"]).forEach((key1) => {
        const avail = obs.observation["available_actions"][key1]
        if (!(avail in this._seen)) {
          this._seen.add(avail)
          this._print(this._action_spec.functions[avail].str(true))
        }
      })
    })
    return all_obs
  }
  _print(s) {
    console.log(s)
  }
}
