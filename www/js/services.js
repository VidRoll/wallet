// Copyright 2015 Coinprism, Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var module = angular.module("OpenChainWallet.Services", []);
var bitcore = require("bitcore");
var ByteBuffer = dcodeIO.ByteBuffer;
var Long = dcodeIO.Long;

module.service("apiService", function ($http, encodingService, LedgerRecord) {

    this.postTransaction = function (endpoint, encodedTransaction, key) {
        
        var transactionBuffer = new Uint8Array(encodedTransaction.toArrayBuffer());
        var hash = bitcore.crypto.Hash.sha256(bitcore.crypto.Hash.sha256(transactionBuffer));

        var signatureBuffer = bitcore.crypto.ECDSA().set({
            hashbuf: hash,
            endian: "big",
            privkey: key.privateKey
        }).sign().sig.toBuffer();

        return $http.post(
            endpoint.rootUrl + "submit",
            {
                transaction: encodedTransaction.toHex(),
                signatures: [
                    {
                        pub_key: ByteBuffer.wrap(key.publicKey.toBuffer()).toHex(),
                        signature: ByteBuffer.wrap(signatureBuffer).toHex()
                    }
                ]
            });
    }

    this.getValue = function (endpoint, key) {
        return $http({
            url: endpoint.rootUrl + "value",
            method: "GET",
            params: { key: key.toHex() }
        }).then(function (result) {
            return {
                key: key,
                value: ByteBuffer.fromHex(result.data.value),
                version: ByteBuffer.fromHex(result.data.version)
            };
        });
    }

    this.getLedgerInfo = function (rootUrl) {
        return $http({
            url: rootUrl + "info",
            method: "GET"
        });
    }

    this.getAccount = function (endpoint, account, asset) {
        return this.getValue(endpoint, encodingService.encodeAccount(account, asset)).then(function (result) {
            var accountResult = {
                key: result.key,
                account: account,
                asset: asset,
                version: result.version
            };

            if (result.value.remaining() == 0) {
                // Unset value
                accountResult["balance"] = Long.ZERO;
            }
            else {
                accountResult["balance"] = encodingService.decodeInt64(result.value);
            }

            return accountResult;
        });
    }

    this.getData = function (endpoint, path, name) {
        return this.getValue(endpoint, encodingService.encodeData(path, name)).then(function (result) {
            var accountResult = {
                key: result.key,
                recordKey: LedgerRecord.parse(result.key),
                version: result.version
            };

            if (result.value.remaining() == 0) {
                // Unset value
                accountResult["data"] = null;
            }
            else {
                accountResult["data"] = encodingService.decodeString(result.value);
            }

            return accountResult;
        });
    }

    this.getAccountAssets = function (endpoint, account) {
        return $http({
            url: endpoint.rootUrl + "query/account",
            method: "GET",
            params: { account: account }
        }).then(function (result) {
            return result.data.map(function (item) {
                return {
                    key: encodingService.encodeAccount(item.account, item.asset),
                    account: item.account,
                    asset: item.asset,
                    version: ByteBuffer.fromHex(item.version),
                    balance: Long.fromString(item.balance)
                };
            });
        });
    }

    this.getSubaccounts = function (endpoint, account) {
        return $http({
            url: endpoint.rootUrl + "query/subaccounts",
            method: "GET",
            params: { account: account }
        }).then(function (result) {
            var records = [];
            for (var item in result.data) {
                var key = ByteBuffer.fromHex(result.data[item].key);
                records.push({
                    key: key,
                    recordKey: LedgerRecord.parse(key),
                    value: ByteBuffer.fromHex(result.data[item].value),
                    version: ByteBuffer.fromHex(result.data[item].version)
                });
            }
            return records;
        });
    }
});

module.service("endpointManager", function (apiService, walletSettings, Endpoint) {
    var nextEndpointId = 0;
    var storedEndpoints = localStorage[walletSettings.versionPrefix + ".endpoints"];

    if (storedEndpoints)
        var initialEndpoints = JSON.parse(storedEndpoints);
    else
        var initialEndpoints = {};

    this.endpoints = {};

    for (var key in initialEndpoints) {
        if (key >= nextEndpointId)
            nextEndpointId = key + 1;

        this.endpoints[key] = new Endpoint(initialEndpoints[key]);
    }

    this.addEndpoint = function (endpoint) {
        var newEndpoint = {
            id: nextEndpointId++,
            rootUrl: endpoint.root_url,
            name: endpoint.name
        };

        this.endpoints[newEndpoint.id] = new Endpoint(newEndpoint);
        this.saveEndpoints();

    };

    this.saveEndpoints = function () {
        var jsonData = {};
        for (var key in this.endpoints)
            jsonData[key] = this.endpoints[key].properties;

        localStorage[walletSettings.versionPrefix + ".endpoints"] = JSON.stringify(jsonData);
    }
});

module.service("encodingService", function () {
    var _this = this;

    this.encodeString = function (value) {
        return ByteBuffer.wrap(value, "utf8", true);
    };

    this.encodeRecordKey = function (path, type, name) {
        return _this.encodeString(path + ":" + type + ":" + name);
    };

    this.encodeAccount = function (account, asset) {
        return _this.encodeRecordKey(account, "ACC", asset);
    };

    this.encodeData = function (path, name) {
        return _this.encodeRecordKey(path, "DATA", name);
    }

    this.encodeInt64 = function (value, usage) {
        var result = new ByteBuffer(null, true);
        result.BE();
        result.writeInt64(value);
        result.flip();
        return result;
    };

    this.decodeInt64 = function (buffer) {
        buffer.BE();
        var result = buffer.readInt64();
        buffer.flip();
        return result;
    };

    this.decodeString = function (buffer) {
        var result = buffer.readUTF8String(buffer.remaining());
        buffer.flip();
        return result;
    };
});

module.service("protobufBuilder", function () {
    var _this = this;

    dcodeIO.ProtoBuf.loadProtoFile("content/schema.proto", function (e, builder) {
        var root = builder.build();
        _this.Mutation = root.OpenChain.Mutation;
        _this.Transaction = root.OpenChain.Transaction;
    });
});

module.service("validator", function () {
    var _this = this;

    this.isNumber = function (number) {
        var regex = /^[\-]?\d+(\.\d+)?$/;
        return regex.test(number);
    }
});