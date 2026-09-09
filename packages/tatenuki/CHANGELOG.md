# Changelog

## [0.3.0](https://github.com/kentrino/tatenuki/compare/tatenuki-v0.2.0...tatenuki-v0.3.0) (2026-09-09)


### Features

* **tatenuki:** dispose lazily created container resources ([ee5aa17](https://github.com/kentrino/tatenuki/commit/ee5aa17b69d729b7dc16185c96195200a321b059))
* **tatenuki:** recurse dependants until all reachable keys are seen ([9bff370](https://github.com/kentrino/tatenuki/commit/9bff370b53e6f12c613ef464ef810c25a29ea8f4))


### Bug Fixes

* **tatenuki:** count only graph keys as resolved ([1095e35](https://github.com/kentrino/tatenuki/commit/1095e35a0bb11c393ef714fed6d10451eb0e138f))
* **tatenuki:** detect minified anonymous class expressions in inject ([1dc2ced](https://github.com/kentrino/tatenuki/commit/1dc2ced071ea31151ef3d141c72b8d5b7e957574))
* **tatenuki:** ignore inherited Object.prototype keys in get ([cc86d9f](https://github.com/kentrino/tatenuki/commit/cc86d9f14469c1e3c9bcf428639af1e7917c8638))
* **tatenuki:** stop cycle checks at resolved values ([269ef4d](https://github.com/kentrino/tatenuki/commit/269ef4def4317bee3e24d156ebafa31b1a884952))


### Performance

* **tatenuki:** allocate pending tracking only for async factories ([24d9664](https://github.com/kentrino/tatenuki/commit/24d96647eda767833bb9205a4fc01f203e5f96b6))
* **tatenuki:** avoid set allocation for single resolutions ([b11b305](https://github.com/kentrino/tatenuki/commit/b11b305365e1a4d7eb1e4fee6badc1c209b77ebe))
* **tatenuki:** defer initial-value identity tracking until the first factory result ([2455643](https://github.com/kentrino/tatenuki/commit/2455643c7dc2784d3b9976a79824f8155b95040d))
* **tatenuki:** defer ownership set allocation ([811ee58](https://github.com/kentrino/tatenuki/commit/811ee58488dd75d25b9945dc44c3378704ecf2cb))
* **tatenuki:** enable synchronous get after full resolution ([2ecf52a](https://github.com/kentrino/tatenuki/commit/2ecf52a06f8b08749d9b7fcb7e82346fb59c6d6b))
* **tatenuki:** resolve the full graph without per-key get() ([54d1e8b](https://github.com/kentrino/tatenuki/commit/54d1e8ba2ef836b45b154e83db34588dfa82eebc))
* **tatenuki:** return cached get() values before in-flight tracking ([6ca5372](https://github.com/kentrino/tatenuki/commit/6ca53725261eb4e0e736f7fd90be205ace7f0908))
* **tatenuki:** reuse cached plans for later uncached roots ([e59dd96](https://github.com/kentrino/tatenuki/commit/e59dd96fc78e95b90b061b00d74e5c56f6425798))
* **tatenuki:** reuse dependency plans across fresh containers ([ed8d7ed](https://github.com/kentrino/tatenuki/commit/ed8d7ed7890fd34937b8f1cccc376b808f785cb0))
* **tatenuki:** reuse dependency snapshots in builders ([f3f1580](https://github.com/kentrino/tatenuki/commit/f3f1580939fdc27e3e0b5bbad7fbd3acad521316))
* **tatenuki:** reuse fulfilled promises for cached get() ([ec30891](https://github.com/kentrino/tatenuki/commit/ec308910bcf4d887bcb2b77283dbd32e4018b940))
* **tatenuki:** reuse the factory-result callback across uncached gets ([c3d66be](https://github.com/kentrino/tatenuki/commit/c3d66be4d28db13a18f64826aa9a1d0427bde4dc))
* **tatenuki:** share pending plans for same-key gets ([1763e58](https://github.com/kentrino/tatenuki/commit/1763e586b5268424730c9a747bcb9a8a23a445ac))
* **tatenuki:** skip a second cache probe on planned get() ([2650d10](https://github.com/kentrino/tatenuki/commit/2650d10d0fd65fbad2da83986712661418f5cefe))
* **tatenuki:** skip in-flight tracking for synchronous get() ([3f42582](https://github.com/kentrino/tatenuki/commit/3f42582321002dc2bed28508eedee2d05c5fb6f3))
* **tatenuki:** skip pending-map work for synchronous factory plans ([48bc840](https://github.com/kentrino/tatenuki/commit/48bc8406bc36606be4fa473bec02cc4b48f3bce2))


### Tests

* **tatenuki:** cover shared dependency continuation behavior ([5199330](https://github.com/kentrino/tatenuki/commit/5199330cb48b34cd4b82b67dc874dbb23ae299c2))


### Miscellaneous

* create kentrino/2026/09/08-4 ([6f4bb76](https://github.com/kentrino/tatenuki/commit/6f4bb76a32390cde7614d23f6e38342aec7a7a68))
* **main:** release tatenuki 0.2.0 ([d8dacac](https://github.com/kentrino/tatenuki/commit/d8dacac3e658cf662bfda8898a72bdd8666e0910))
* **main:** release tatenuki 0.2.0 ([3193e60](https://github.com/kentrino/tatenuki/commit/3193e60c31b48271bf5786f58287c49456519397))

## [0.2.0](https://github.com/kentrino/tatenuki/compare/tatenuki-v0.1.0...tatenuki-v0.2.0) (2026-09-02)


### Features

* **tatenuki:** add a typed alias() factory helper ([efab085](https://github.com/kentrino/tatenuki/commit/efab0859cf58cd55ed745a0509e1597b5670388c))


### CI/CD

* add GitHub Actions workflows for CI and releases ([bb476d6](https://github.com/kentrino/tatenuki/commit/bb476d69f5b31ed7402f59e0f4685aa5055f256b))


### Miscellaneous

* add MIT license ([db04e7b](https://github.com/kentrino/tatenuki/commit/db04e7b04e92864613c5580026bd79e1a1446d9e))
* create kentrino/2026/09/02-1 ([ad28a33](https://github.com/kentrino/tatenuki/commit/ad28a33c4a2e2ab8b008f4cd47bd9e3df418dfd3))
* create kentrino/2026/09/02-3 ([ef5ca0a](https://github.com/kentrino/tatenuki/commit/ef5ca0ac393b09abe59f3fa2b46e81484e025bc8))
* **deps:** update dependencies ([babefaf](https://github.com/kentrino/tatenuki/commit/babefaf454b79805fb649af3231bb905c28a0cb2))
* move files to appropriate directories ([324561f](https://github.com/kentrino/tatenuki/commit/324561f339292412364b4737905bb31fb05bfbdc))
* **tatenuki:** add repository metadata ([98e4b3f](https://github.com/kentrino/tatenuki/commit/98e4b3f2bf2165b8efb0814e2dd922ff21c20c13))
* **tatenuki:** clean the output directory before building ([264b238](https://github.com/kentrino/tatenuki/commit/264b238532cf92ac4d09c0d3c4e2c47a6f577330))
* **tatenuki:** prepare the package for npm publish ([8c4e23c](https://github.com/kentrino/tatenuki/commit/8c4e23c03476b28fec58722baf7c2f07dd6e5e09))
