/*
 * angucomplete-extra
 * Autocomplete directive for AngularJS
 * This is a fork of Daryl Rowland's angucomplete with some extra features.
 * By Hidenari Nozaki
 *
 * Copyright (c) 2014 Hidenari Nozaki and contributors
 * Licensed under the MIT license
 */

'use strict';

angular.module('angucomplete-alt', []).directive('angucompleteAlt', ['$templateCache', '$compile', '$parse', '$http', '$sce', '$timeout', function ($templateCache, $compile, $parse, $http, $sce, $timeout) {
	var KEY_DW = 40,
			KEY_UP = 38,
			KEY_ES = 27,
			KEY_EN = 13,
			KEY_BS = 8,
			MIN_LENGTH = 3,
			PAUSE = 500;

	var DEFAULT_TEMPLATE = '<div class="angucomplete-holder">\n\t<input id="{{id}}_value" ng-model="searchStr" type="text" placeholder="{{placeholder}}"\n\t\t   class="{{inputClass}}" ng-focus="resetHideResults()" ng-blur="hideResults()"/>\n\n\t<div id="{{id}}_dropdown" class="angucomplete-dropdown" ng-if="showDropdown">\n\t\t<div class="angucomplete-searching" ng-show="searching">Searching...</div>\n\t\t<div class="angucomplete-searching" ng-show="!searching && (!results || results.length == 0)">No results found\n\t\t</div>\n\t\t<div class="angucomplete-row" ng-repeat="result in results" ng-click="selectResult(result)"\n\t\t\t ng-mouseover="selectRow($index)" ng-class="{\'angucomplete-selected-row\': $index == currentIndex}">\n\t\t\t<div ng-if="imageField" class="angucomplete-image-holder">\n\t\t\t\t<img ng-if="result.image && result.image != \'\'"\n\t\t\t\t\t ng-src="{{result.image}}"\n\t\t\t\t\t class="angucomplete-image"/>\n\n\t\t\t\t<div ng-if="!result.image && result.image != \'\'" class="angucomplete-image-default"></div>\n\t\t\t</div>\n\t\t\t<div class="angucomplete-title" ng-bind-html="result.title"></div>\n\t\t\t<div ng-if="result.description && result.description != \'\'" class="angucomplete-description"\n\t\t\t\t ng-bind-html="result.description"></div>\n\t\t</div>\n\t</div>\n</div>'

	return {
		restrict: 'EA',
		scope: {
			onSelectObject: '&',
			selectedObject: '=',
			localData: '=',
			remoteUrlRequestFormatter: '=',
			id: '@',
			placeholder: '@',
			remoteUrl: '@',
			remoteUrlDataField: '@',
			titleField: '@',
			descriptionField: '@',
			imageField: '@',
			inputClass: '@',
			pause: '@',
			searchFields: '@',
			minlength: '@',
			matchClass: '@',
			clearSelected: '@',
			overrideSuggestions: '@',
			customTemplate: '@'
		},

		link: function (scope, element, attrs) {
			var searchTimer = null;
			var lastSearchTerm = null;
			var hideTimer;

			scope.currentIndex = null;
			scope.searchStr = null;
			scope.searching = false;

			if (!scope.minlength || scope.minlength === '') {
				scope.minlength = MIN_LENGTH;
			}

			if (!scope.pause || scope.pause === '') {
				scope.pause = PAUSE;
			}

			if (!scope.clearSelected) {
				scope.clearSelected = false;
			}

			if (!scope.overrideSuggestions) {
				scope.overrideSuggestions = false;
			}


			scope.$watch(attrs.customTemplate, function (value) {
				loadTemplate(value)
			});

			var loadTemplate = function (templateUrl) {
				if (templateUrl) {
					$http.get(templateUrl, { cache: $templateCache })
							.success(function (templateContent) {
								element.html(templateContent);
								$compile(element.contents())(scope)
							});
				} else {
					element.html(DEFAULT_TEMPLATE)
					$compile(element.contents())(scope)
				}
			}


			scope.setInputString = function (str) {
				scope.selectedObject = {originalObject: str};

				if (scope.clearSelected) {
					scope.searchStr = null;
				}

				scope.showDropdown = false;
				lastSearchTerm = scope.str;
			};

			var isNewSearchNeeded = function (newTerm, oldTerm) {
				return newTerm.length >= scope.minlength && newTerm !== oldTerm;
			};

			var extractValue = function (obj, key) {
				var keys, result;
				if (key) {
					keys = key.split('.');
					result = obj;
					keys.forEach(function (k) {
						result = result[k];
					});
				}
				else {
					result = obj;
				}
				return result;
			};

			scope.hideResults = function () {
				hideTimer = $timeout(function () {
					scope.showDropdown = false;
				}, scope.pause);
			};

			scope.resetHideResults = function () {
				if (hideTimer) {
					$timeout.cancel(hideTimer);
				}
			};

			scope.processResults = function (responseData, query) {
				scope.results = [];
				if (!responseData || responseData.length <= 0) return

				var titleFields, titleCode, i, t, description, image, text, re;

				titleFields = [];

				if (scope.titleField && scope.titleField !== '') {
					titleFields = scope.titleField.split(',');
				}

				limit = responseData.length;
				for (i = 0; i < limit; i++) {
					// Get title variables
					titleCode = [];

					for (t = 0; t < titleFields.length; t++) {
						titleCode.push(responseData[i][titleFields[t]]);
					}

					description = '';
					if (scope.descriptionField) {
						description = extractValue(responseData[i], scope.descriptionField);
					}

					image = '';
					if (scope.imageField) {
						image = extractValue(responseData[i], scope.imageField);
					}

					text = titleCode.join(' ');
					if (scope.matchClass) {
						re = new RegExp("(" + query.split(' ').join('|') + ")", 'ig');

						if (text.match(re) != null) {
							text = text.replace(re, '<span class="' + scope.matchClass + '">$1</span>');
						}

						if (description.match(re) != null) {
							description = description.replace(re, '<span class="' + scope.matchClass + '">$1</span>');
						}
					}

					scope.results[scope.results.length] = {
						title: $sce.trustAsHtml(text),
						description: $sce.trustAsHtml(description),
						image: image,
						originalObject: responseData[i]
					};

				}
			};

			scope.searchTimerComplete = function (query) {
				if (query.length < scope.minlength) return;

				var searchFields, matches, i, match, s, params;

				if (scope.localData) {
					searchFields = scope.searchFields.split(',');

					matches = [];

					for (i = 0; i < scope.localData.length; i++) {
						match = false;

						for (s = 0; s < searchFields.length; s++) {
							match = match || (scope.localData[i][searchFields[s]].toLowerCase().indexOf(query.toLowerCase()) >= 0);
						}

						if (match) {
							matches[matches.length] = scope.localData[i];
						}
					}

					scope.searching = false;
					scope.processResults(matches, query);

				} else if (scope.remoteUrlRequestFormatter) {
					params = scope.remoteUrlRequestFormatter(query);
					$http.get(scope.remoteUrl, {params: params}).
							success(function (responseData, status, headers, config) {
								scope.searching = false;
								scope.processResults(extractValue(responseData, scope.remoteUrlDataField), query);
							}).
							error(function (data, status, headers, config) {
								console.log('error');
							});

				} else {
					$http.get(scope.remoteUrl + query, {}).
							success(function (responseData, status, headers, config) {
								scope.searching = false;
								scope.processResults(extractValue(responseData, scope.remoteUrlDataField), query);
							}).
							error(function (data, status, headers, config) {
								console.log('error');
							});
				}

			};

			scope.selectResult = function (result) {
				var title

				if (scope.matchClass) {
					title = result.title.toString().replace(/(<([^>]+)>)/ig, '');
				}

				if (scope.clearSelected) {
					console.log("aa")
					scope.searchStr = null;
				} else {
					scope.searchStr = lastSearchTerm = title;
				}
				scope.selectedObject = result;
				scope.showDropdown = false;
			};


			scope.selectRow = function (index) {
				scope.currentIndex = index;
				scope.$apply();

			};

			scope.deselectRow = function () {
				scope.currentIndex = -1;
				scope.$apply();
			}

			scope.selectNextRow = function () {
				if (scope.currentIndex < scope.results.length - 1) {
					scope.currentIndex++;
					scope.$apply();
				}
			}

			scope.selectPrevRow = function () {
				if (scope.currentIndex >= 0) {
					scope.currentIndex--;
					scope.$apply();
				}
			}


			element.on('keydown', 'input', function (event) {
				if (scope.results && scope.results.length > 0) {
					if (event.which === KEY_DW) {
						event.preventDefault();
						scope.selectNextRow()
					} else if (event.which === KEY_UP) {
						event.preventDefault();
						scope.selectPrevRow()
					}
				}
			})


			element.on('keyup', 'input', function (event) {
				if (!(event.which === KEY_UP || event.which === KEY_DW || event.which === KEY_EN)) {

					if (!scope.searchStr || scope.searchStr === '' || scope.searchStr.length < scope.minlength) {
						scope.results = [];
						lastSearchTerm = null;
						scope.showDropdown = false
						scope.currentIndex = -1;
						scope.$apply()

					} else if (isNewSearchNeeded(scope.searchStr, lastSearchTerm)) {
						scope.results = [];
						lastSearchTerm = scope.searchStr;
						scope.showDropdown = true;
						scope.searching = true;
						scope.currentIndex = -1;

						if (searchTimer) {
							$timeout.cancel(searchTimer);
						}

						searchTimer = $timeout(function () {
							scope.searchTimerComplete(scope.searchStr);
						}, scope.pause);
					}

				} else {
					event.preventDefault();
				}
			})


			element.on('keyup', function (event) {
				if (event.which === KEY_EN) {
					console.log(scope.results)
					if (scope.results) {
						if (scope.currentIndex >= 0 && scope.currentIndex < scope.results.length) {
							var currentResult = scope.results[scope.currentIndex];
							scope.selectResult(currentResult);
						} else {
							if (scope.overrideSuggestions) {
								scope.setInputString(scope.searchStr);
							} else {
								scope.results = [];
							}
						}
						scope.$apply()
						scope.onSelectObject({results: scope.results})
					}
					event.preventDefault();
				} else if (event.which === KEY_ES) {
					scope.currentIndex = -1;
					scope.showDropdown = false;
					scope.$apply();
				} else if (event.which === KEY_BS) {
					scope.selectedObject = null;
					scope.$apply();
				}
			});
		}
	};
}]);

