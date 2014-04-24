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

	var DEFAULT_TEMPLATE = '<div class="angucomplete-holder">\n\t<input id="{{id}}_value" ng-model="searchStr" type="text" placeholder="{{placeholder}}"\n\t\t   class="{{inputClass}}" ng-focus="resetHideResults()" ng-blur="hideResults()"/>\n\n\t<div id="{{id}}_dropdown" class="angucomplete-dropdown" ng-if="showDropdown">\n\t\t<div class="angucomplete-searching" ng-show="searching">Searching...</div>\n\t\t<div class="angucomplete-searching" ng-show="!searching && (!results || results.length == 0)">No results found\n\t\t</div>\n\t\t<div class="angucomplete-row" ng-repeat="result in results" ng-click="selectResult(result)"\n\t\t\t ng-mouseover="hoverRow($index)" ng-class="{\'angucomplete-selected-row\': $index == currentIndex}">\n\t\t\t<div ng-if="imageField" class="angucomplete-image-holder">\n\t\t\t\t<img ng-if="result.image && result.image != \'\'"\n\t\t\t\t\t ng-src="{{result.image}}"\n\t\t\t\t\t class="angucomplete-image"/>\n\n\t\t\t\t<div ng-if="!result.image && result.image != \'\'" class="angucomplete-image-default"></div>\n\t\t\t</div>\n\t\t\t<div class="angucomplete-title" ng-bind-html="result.title"></div>\n\t\t\t<div ng-if="result.description && result.description != \'\'" class="angucomplete-description"\n\t\t\t\t ng-bind-html="result.description"></div>\n\t\t</div>\n\t</div>\n</div>'

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

		link: function (scope, elem, attrs) {
			var inputField,
					minlength = MIN_LENGTH,
					searchTimer = null,
					lastSearchTerm = null,
					hideTimer;

			scope.currentIndex = null;
			scope.searching = false;
			scope.searchStr = null;

			scope.$watch(attrs.customTemplate, function (value) {
				loadTemplate(value)
			});

			function loadTemplate(templateUrl) {
				if (templateUrl) {
					$http.get(templateUrl, { cache: $templateCache })
							.success(function (templateContent) {
								elem.html(templateContent);
								$compile(elem.contents())(scope)
							});
				} else {
					elem.html(DEFAULT_TEMPLATE)
					$compile(elem.contents())(scope)
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
				return newTerm.length >= minlength && newTerm !== oldTerm;
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

			if (scope.minlength && scope.minlength !== '') {
				minlength = scope.minlength;
			}

			if (!scope.pause) {
				scope.pause = PAUSE;
			}

			if (!scope.clearSelected) {
				scope.clearSelected = false;
			}

			if (!scope.overrideSuggestions) {
				scope.overrideSuggestions = false;
			}

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

			scope.processResults = function (responseData, str) {
				var titleFields, titleCode, i, t, description, image, text, re, titlePart;

				if (responseData && responseData.length > 0) {
					scope.results = [];

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
							re = new RegExp("(" + str.split(' ').join('|') + ")", 'ig');

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


				} else {
					scope.results = [];
				}
			};

			scope.searchTimerComplete = function (str) {
				// Begin the search
				var searchFields, matches, i, match, s, params;

				if (str.length >= minlength) {
					if (scope.localData) {
						searchFields = scope.searchFields.split(',');

						matches = [];

						for (i = 0; i < scope.localData.length; i++) {
							match = false;

							for (s = 0; s < searchFields.length; s++) {
								match = match || (scope.localData[i][searchFields[s]].toLowerCase().indexOf(str.toLowerCase()) >= 0);
							}

							if (match) {
								matches[matches.length] = scope.localData[i];
							}
						}

						scope.searching = false;
						scope.processResults(matches, str);

					} else if (scope.remoteUrlRequestFormatter) {
						params = scope.remoteUrlRequestFormatter(str);
						$http.get(scope.remoteUrl, {params: params}).
								success(function (responseData, status, headers, config) {
									scope.searching = false;
									scope.processResults(extractValue(responseData, scope.remoteUrlDataField), str);
								}).
								error(function (data, status, headers, config) {
									console.log('error');
								});

					} else {
						$http.get(scope.remoteUrl + str, {}).
								success(function (responseData, status, headers, config) {
									scope.searching = false;
									scope.processResults(extractValue(responseData, scope.remoteUrlDataField), str);
								}).
								error(function (data, status, headers, config) {
									console.log('error');
								});
					}
				}

			};

			scope.hoverRow = function ($index) {
				scope.currentIndex = $index;
			};

			scope.keyPressed = function (event) {
				if (!(event.which === KEY_UP || event.which === KEY_DW || event.which === KEY_EN)) {
					if (!scope.searchStr || scope.searchStr === '') {
						scope.showDropdown = false;
						lastSearchTerm = null;
					} else if (isNewSearchNeeded(scope.searchStr, lastSearchTerm)) {
						lastSearchTerm = scope.searchStr;
						scope.showDropdown = true;
						scope.currentIndex = -1;
						scope.results = [];

						if (searchTimer) {
							$timeout.cancel(searchTimer);
						}

						scope.searching = true;

						searchTimer = $timeout(function () {
							scope.searchTimerComplete(scope.searchStr);
						}, scope.pause);
					}
				} else {
					event.preventDefault();
				}
			};

			scope.selectResult = function (result) {
				if (scope.matchClass) {
					result.title = result.title.toString().replace(/(<([^>]+)>)/ig, '');
				}

				if (scope.clearSelected) {
					scope.searchStr = null;
				}
				else {
					scope.searchStr = lastSearchTerm = result.title;
				}
				scope.selectedObject = result;
				scope.showDropdown = false;
				scope.results = [];
				scope.onSelectObject({results:scope.results})
			};

			elem.on('keyup', 'input', scope.keyPressed);

			//Keyboard highlight result
			elem.on('keydown', 'input', function (event) {
				if (scope.results && scope.results.length > 0) {
					if (event.which === KEY_DW) {
						event.preventDefault();
						if (scope.currentIndex < scope.results.length - 1) {
							scope.currentIndex++;
							scope.$apply();
						}
					} else if (event.which === KEY_UP) {
						event.preventDefault();
						if (scope.currentIndex >= 0) {
							scope.currentIndex--;
							scope.$apply();
						}
					}
				}
			})

			elem.on('keyup', function (event) {
				if (event.which === KEY_EN) {
					if (scope.results) {
						scope.onSelectObject({results:scope.results})
						if (scope.currentIndex >= 0 && scope.currentIndex < scope.results.length) {
							scope.selectResult(scope.results[scope.currentIndex]);
						} else {
							if (scope.overrideSuggestions) {
								scope.setInputString(scope.searchStr);
							} else {
								scope.results = [];
							}
						}
						scope.$apply();
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

