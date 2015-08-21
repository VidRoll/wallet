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

var module = angular.module("OpenChainWallet.Controllers");
var ByteBuffer = dcodeIO.ByteBuffer;
var bitcore = require("bitcore");
var Mnemonic = require("bitcore-mnemonic");

// ***** AddEndpointController *****
// *********************************

module.controller("AddEndpointController", function ($scope, $rootScope, $location, walletSettings, apiService, endpointManager) {

    if (!walletSettings.initialized) {
        $location.path("/signin");
        return;
    }

    $rootScope.selectedTab = "none";

    $scope.check = function () {
        apiService.getLedgerInfo($scope.endpointUrl).then(function (result) {
            $scope.endpoint = result.data;
        }, function () {
            $scope.addEndpointForm.endpointUrl.$setValidity("connectionError", false);
        });
    };

    $scope.changeUrl = function () {
        $scope.addEndpointForm.endpointUrl.$setValidity("connectionError", true);
    };

    $scope.confirm = function () {
        endpointManager.addEndpoint($scope.endpoint);
        $location.path("/");
    };
});
