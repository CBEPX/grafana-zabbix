define([
  'angular',
  'lodash'
],
function (angular, _) {
  'use strict';

  var module = angular.module('grafana.controllers');
  var targetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  module.controller('ZabbixAPIQueryCtrl', function($scope, $sce, templateSrv) {

    $scope.init = function() {
      $scope.targetLetters = targetLetters;
      $scope.metric = {
        hostGroupList: ["Loading..."],
        hostList: ["Loading..."],
        applicationList: ["Loading..."],
        itemList: ["Loading..."]
      };

      // Update host group, host, application and item lists
      $scope.updateGroupList();
      $scope.updateHostList();
      $scope.updateAppList();
      $scope.updateItemList();

      setItemAlias();

      $scope.target.errors = validateTarget($scope.target);
    };


    /**
     * Take alias from item name by default
     */
    function setItemAlias() {
      if (!$scope.target.alias && $scope.target.item) {
        $scope.target.alias = expandItemName($scope.target.item);
      }
    };


    $scope.targetBlur = function() {
      setItemAlias();
      $scope.target.errors = validateTarget($scope.target);
      if (!_.isEqual($scope.oldTarget, $scope.target) && _.isEmpty($scope.target.errors)) {
        $scope.oldTarget = angular.copy($scope.target);
        $scope.get_data();
      }
    };


    /**
     * Call when host group selected
     */
    $scope.selectHostGroup = function() {
      $scope.updateHostList()
      $scope.updateAppList();
      $scope.updateItemList();

      $scope.target.errors = validateTarget($scope.target);
      if (!_.isEqual($scope.oldTarget, $scope.target) && _.isEmpty($scope.target.errors)) {
        $scope.oldTarget = angular.copy($scope.target);
        $scope.get_data();
      }
    };


    /**
     * Call when host selected
     */
    $scope.selectHost = function() {
      $scope.updateAppList();
      $scope.updateItemList();

      $scope.target.errors = validateTarget($scope.target);
      if (!_.isEqual($scope.oldTarget, $scope.target) && _.isEmpty($scope.target.errors)) {
        $scope.oldTarget = angular.copy($scope.target);
        $scope.get_data();
      }
    };


    /**
     * Call when application selected
     */
    $scope.selectApplication = function() {
      $scope.updateItemList();

      $scope.target.errors = validateTarget($scope.target);
      if (!_.isEqual($scope.oldTarget, $scope.target) && _.isEmpty($scope.target.errors)) {
        $scope.oldTarget = angular.copy($scope.target);
        $scope.get_data();
      }
    };


    /**
     * Call when item selected
     */
    $scope.selectItem = function() {
      setItemAlias();
      $scope.target.errors = validateTarget($scope.target);
      if (!_.isEqual($scope.oldTarget, $scope.target) && _.isEmpty($scope.target.errors)) {
        $scope.oldTarget = angular.copy($scope.target);
        $scope.get_data();
      }
    };


    $scope.duplicate = function() {
      var clone = angular.copy($scope.target);
      $scope.panel.targets.push(clone);
    };


    $scope.moveMetricQuery = function(fromIndex, toIndex) {
      _.move($scope.panel.targets, fromIndex, toIndex);
    };

    //////////////////////////////
    // SUGGESTION QUERIES
    //////////////////////////////


    /**
     * Update list of host groups
     */
    $scope.updateGroupList = function() {
      $scope.metric.groupList = [{name: '*', visible_name: 'All'}];
      addTemplatedVariables($scope.metric.groupList);

      $scope.datasource.performHostGroupSuggestQuery().then(function (groups) {
        $scope.metric.groupList = $scope.metric.groupList.concat(groups);
      });
    };


    /**
     * Update list of hosts
     */
    $scope.updateHostList = function() {
      $scope.metric.hostList = [{name: '*', visible_name: 'All'}];
      addTemplatedVariables($scope.metric.hostList);

      var groups = $scope.target.group ? splitMetrics(templateSrv.replace($scope.target.group.name)) : undefined;
      $scope.datasource.hostFindQuery(groups).then(function (hosts) {
        $scope.metric.hostList = $scope.metric.hostList.concat(hosts);
      });
    };


    /**
     * Update list of host applications
     */
    $scope.updateAppList = function() {
      $scope.metric.applicationList = [{name: '*', visible_name: 'All'}];
      addTemplatedVariables($scope.metric.applicationList);

      var groups = $scope.target.group ? splitMetrics(templateSrv.replace($scope.target.group.name)) : undefined;
      var hosts = $scope.target.host ? splitMetrics(templateSrv.replace($scope.target.host.name)) : undefined;
      $scope.datasource.appFindQuery(hosts, groups).then(function (apps) {
        // TODO: work with app names, not objects
        var apps = _.map(_.uniq(_.map(apps, 'name')), function (appname) {
          return {name: appname};
        });
        $scope.metric.applicationList = $scope.metric.applicationList.concat(apps);
      });
    };


    /**
     * Update list of items
     */
    $scope.updateItemList = function() {
      $scope.metric.itemList = [{name: 'All'}];;
      addTemplatedVariables($scope.metric.itemList);

      var groups = $scope.target.group ? splitMetrics(templateSrv.replace($scope.target.group.name)) : undefined;
      var hosts = $scope.target.host ? splitMetrics(templateSrv.replace($scope.target.host.name)) : undefined;
      var apps = $scope.target.application ? splitMetrics(templateSrv.replace($scope.target.application.name)) : undefined;
      $scope.datasource.itemFindQuery(groups, hosts, apps).then(function (items) {
        // Show only unique item names
        var uniq_items = _.map(_.uniq(items, function (item) {
          return expandItemName(item);
        }), function (item) {
          return {name: expandItemName(item)}
        });
        $scope.metric.itemList = $scope.metric.itemList.concat(uniq_items);
      });
    };


    /**
     * Add templated variables to list of available metrics
     *
     * @param {Array} metricList List of metrics which variables add to
     */
    function addTemplatedVariables(metricList) {
      _.each(templateSrv.variables, function(variable) {
        metricList.push({
          name: '$' + variable.name,
          templated: true
        })
      });
    };


    /**
     * Expand item parameters, for example:
     * CPU $2 time ($3) --> CPU system time (avg1)
     *
     * @param  {Object} item Zabbix item object
     * @return {string}      expanded item name
     */
    function expandItemName(item) {
      var name = item.name;
      var key = item.key_;

      if (key) {
        // extract params from key:
        // "system.cpu.util[,system,avg1]" --> ["", "system", "avg1"]
        var key_params = key.substring(key.indexOf('[') + 1, key.lastIndexOf(']')).split(',');

        // replace item parameters
        for (var i = key_params.length; i >= 1; i--) {
          name = name.replace('$' + i, key_params[i - 1]);
        };
      }
      return name;
    };


    //////////////////////////////
    // VALIDATION
    //////////////////////////////

    function validateTarget(target) {
      var errs = {};

      return errs;
    }

  });

});


/**
 * Convert multiple mettrics to array
 * "{metric1,metcic2,...,metricN}" --> [metric1, metcic2,..., metricN]
 *
 * @param  {string} metrics   "{metric1,metcic2,...,metricN}"
 * @return {Array}            [metric1, metcic2,..., metricN]
 */
function splitMetrics(metrics) {
  var remove_brackets_pattern = /^{|}$/g;
  var metric_split_pattern = /,(?!\s)/g;
  return metrics.replace(remove_brackets_pattern, '').split(metric_split_pattern)
}