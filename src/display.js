/**
 * Handles all HTML elements on the page, except for the context bubble,
 * which will get handled by `Context` 
 * @constructor
 */
function Display() {
    this.loader = gel('loaderContainer');
    this.progressBar = gel('mask');
    this.progressBarTotalLength = [];
    this.progress = 0;
    this.fileSize = null;
    this.lastLoadingBarRefreshed = null;

    this.searchBar = document.getElementById('searchBar');
    this.searchTerms = gel('searchTerms');
    this.table = gel('result');
    this.renderedResults = 0;

    this.yearRange = [null, null];
    this.origData = null;
    this.tableData = null;
    this.sortable = ['up', 'down', null];

    this.contextLength = null;
    this.maxResultLength = null;

    this.state = 'loadingData';

    this.measureProgressBarTotalLength();
    this.estimateFileSize();

    searcher.registerEventListener('searchFinished', this.feedData.bind(this));
    searcher.registerEventListener('indexReady', this.indexReady.bind(this));
    window.addEventListener('scroll', this.onScroll.bind(this));
}

/**
 * Renders more content if any once reaches the end of the page
 * @private
 * @listens Event
 */
Display.prototype.onScroll = function() {
    if (this.state === 'searchPage' && (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) > (document.body.offsetHeight - window.outerHeight)) {
        this.renderResults();
    }
}

/**
 * Since it would be troublesome to update the real file size if the archive
 * gets updated every six months (maybe not i guess i'm just lazy), having a
 * good estimate of the file size will help user see a better progress bar.
 * Actually, the precision shouldn't matter as only 85% of the progress bar is
 * reserved for file loading. 
 * @private
 */
Display.prototype.estimateFileSize = function() {
    var yearlyIncrease = 200000;
    var startYear = 2019;
    var startFileSize = 13275000;
    this.fileSize = startFileSize + yearlyIncrease * ((new Date().getUTCFullYear()) - startYear);
}

/**
 * Measures the full width of the title so the mask for loading bar can move
 * correctly. There are two types of the main title: one with line wrap and one
 * without. Their full width differs by a space.
 * @private
 */
Display.prototype.measureProgressBarTotalLength = function() {
    var measurements = document.getElementsByClassName('lengthMeasurement');
    for (var i = measurements.length - 1; i >= 0; i--) {
        this.progressBarTotalLength.push(measurements[i].getBoundingClientRect().width);
        this.loader.removeChild(measurements[i]);
    }
    this.progressBarTotalLength.sort(function(a, b) {
        return a - b;
    });
}

/**
 * Updates the main loading bar
 * @private
 * @param {number} percent 
 */
Display.prototype.updateProgressBarPercentage = function(percent) {
    this.progress = percent;
    var totLengthArr = this.progressBarTotalLength;
    var totLength = totLengthArr[1];
    // if the title is wrapped, use the smaller measurement (where there's no space)
    if (Math.abs(this.progressBar.offsetWidth - totLength) / totLength > 0.2) {
        totLength = totLengthArr[0];
    }
    this.progressBar.style.backgroundPositionX = (percent * totLength).toFixed(2) + 'px';
}

/**
 * Updates the main progress bar every 250ms based on how much file has
 * downloaded. It consists 85% of the progress bar. Uses the estimated file
 * size.
 * @public
 * @param {ProgressEvent} e 
 */
Display.prototype.onDownloadProgress = function(e) {
    if (this.fileSize && new Date() - this.lastLoadingBarRefreshed > 250) {
        this.lastLoadingBarRefreshed = new Date();
        this.updateProgressBarPercentage(e.loaded / this.fileSize * 0.85);
    }
}

/**
 * Displays fake progress while the CPU builds the inverted index
 * @public
 * @param {Date} timeLoaded 
 */
Display.prototype.fileLoaded = function(timeLoaded) {
    this.state = 'buildingIndex';

    var self = this;

    var loadingCoeff = 0.15;
    var easeNextTicks = 8;

    function computeNextPoint(curr) {
        return curr + (0.99 - curr) * loadingCoeff;
    }

    // unit: percentage / second
    var currentSpeed = (0.85 - this.progress) / (timeLoaded - this.lastLoadingBarRefreshed) * 1000;

    var takeOverPoint = this.progress;

    for (var i = 0; i < easeNextTicks; i++) {
        takeOverPoint = computeNextPoint(takeOverPoint);
    }

    var terminalSpeed = (computeNextPoint(takeOverPoint) - takeOverPoint) / 0.25;

    // quadratic easing curve where 
    // f(x) = ax^2 + bx + c, f(0) = n_1, f'(0) = v_1, f(x_0) = n_2, f'(x_0) = v_2

    // wow, i wish i knew devtools made a change to this assignment method eariler
    var v1 = currentSpeed
      , v2 = terminalSpeed
      , n1 = this.progress
      , n2 = takeOverPoint
      , x0 = 2 * (n2 - n1) / (v1 + v2)
      , a = (v2 * v2 - v1 * v1) / (n2 - n1) / 4
      , b = v1
      , c = n1;

    var nextTicks = [];
    for (var i = x0 / easeNextTicks; i <= Math.abs(x0); i += x0 / easeNextTicks) {
        nextTicks.push(a * i * i + b * i + c);
    }

    var intervalId;

    // a classical trick, isn't it?
    function fakeUpdate() {
        if (self.state !== 'buildingIndex') {
            clearInterval(intervalId);
        } else {
            var nextTick = nextTicks.shift();
            if (!nextTick) {
                nextTick = computeNextPoint(self.progress);
            }
            self.updateProgressBarPercentage(nextTick);
        }
    }
    intervalId = setInterval(fakeUpdate, 250);
    fakeUpdate();
}

/**
 * Removes the loader div and reveals the search bar when the index is built
 * @private
 * @listens Searcher~indexReady
 */
Display.prototype.indexReady = function() {
    this.state = 'aboutPage';

    this.updateProgressBarPercentage(1);

    var loader = this.loader;
    document.body.classList.remove('loading');
    loader.classList.add('loaded');
    this.searchBar.focus();
    loader.addEventListener('transitionend', function(e) {
        if (e.target === loader && e.propertyName === 'opacity') {
            // well, we have some memory leakage going on here, but I don't
            // care as there's only one element in trouble
            loader.parentNode.removeChild(loader);
        }
    });
}

/**
 * @public
 */
Display.prototype.prepareSearchPage = function() {
    this.state = 'searchPage';
    var links = gel('links');
    links.parentNode.removeChild(links);
    this.renderSearchOptions();
    this.setupTableHeader();
}

/**
 * @private
 */
Display.prototype.setupTableHeader = function() {
    var table = this.table;
    var columns = ['File', 'Occurrence', 'Context'];
    var sortable = this.sortable;

    var thead = el('thead', table);
    var tbody = el('tbody', table);

    var headerRow = el('tr', thead);
    for (var i in columns) {
        var th = el('th', headerRow);
        th.innerHTML = columns[i];
        if (sortable[i]) {
            th.classList.add('sortable');
            th.dataset.index = i;
            th.addEventListener('click', this.onSortingChange.bind(this));
        }
    }
    this.currentSorting = headerRow.children[0];
    headerRow.children[0].classList.add('up');
    this.table = tbody;
}

/**
 * Renders options based on the `inputs`. I think I improve the way a button is
 * rendered?
 * @private
 */
Display.prototype.renderSearchOptions = function() {
    var inputSpan = gel('inputs');
    for (var i in inputs) {
        var settings = inputs[i];
        var label = el('label', inputSpan, settings.class);
        var span = el('span', label);
        var input = el('input', label);

        span.innerHTML = settings.label + ' ';

        for (var i in settings.properties) {
            input[i] = settings.properties[i];
        }
        for (var j in settings.events) {
            input.addEventListener(j, settings.events[j]);
        }
    }
}

/**
 * Changes how search result is sorted
 * @private
 * @param {MouseEvent} e 
 * @listens MouseEvent
 */
Display.prototype.onSortingChange = function(e) {
    var target = e.currentTarget;
    if (target === this.currentSorting) {
        var methods = ['up', 'down'];
        var method = target.classList.item(1);
        var newMethod = methods[!methods.indexOf(method) + 0];
        target.classList.remove(method);
        target.classList.add(newMethod);
    } else {
        this.currentSorting.classList.remove(this.currentSorting.classList.item(1));
        this.currentSorting = target;
        target.classList.add(this.sortable[target.dataset.index]);
    }
    this.refreshTable();
}

/**
 * Distribute and display the search result data
 * @private
 * @param {searchResult} data see the return element from `Searcher.search`
 * @listens Searcher~searchFinished
 */
Display.prototype.feedData = function(data) {
    // i should probably just write an adapter 

    var searchTermData = data['searchTerms'];
    var hiddenWords = data['stopWords'];

    this.origData = data;
    this.hiddenWords = hiddenWords;

    this.clearSearchTerms();
    this.renderSearchTerms(searchTermData, hiddenWords);
    this.processAndRenderTableData();
}

/**
 * Clears the search term div
 * @public
 */
Display.prototype.clearSearchTerms = function() {
    while (this.searchTerms.firstChild) {
        this.searchTerms.removeChild(this.searchTerms.lastChild);
    }
}

/**
 * Clears the result table
 * @public
 */
Display.prototype.clearTable = function() {
    while (this.table.firstChild) {
        this.table.removeChild(this.table.lastChild);
    }
}

/**
 * @private
 * @param {string[]} termArr the text of the term
 * @param {boolean[]} initialHiddenWords should be stopwords that are cluttering
 * the result
 */
Display.prototype.renderSearchTerms = function(termArr, initialHiddenWords) {
    var frag = document.createDocumentFragment();
    var self = this;
    termArr.forEach(function(term, idx) {
        var wrapper = el('span', frag, 'term term-' + idx);
        var text = el('span', wrapper, 'term-text');
        text.innerHTML = term + ':';
        var color = el('span', wrapper, 'term-color');

        if (initialHiddenWords[idx]) {
            wrapper.classList.add('hidden');
        }

        wrapper.addEventListener('click', self.handleKeywordClick.bind(self));
    });
    this.searchTerms.appendChild(frag);
}

/**
 * Toggles if a keyword is displayed in the result
 * @private
 * @param {MouseEvent} event 
 * @listens MouseEvent
 */
Display.prototype.handleKeywordClick = function(event) {
    var wrapper = event.currentTarget;
    var wrapperClass = wrapper.className;
    var id = parseInt(/\d+/.exec(wrapperClass)[0]);
    var changedResult = !wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden');
    this.hiddenWords[id] = changedResult;
    this.processAndRenderTableData();
}

/**
 * Applies filtering rules and sorting options. Then renders the table.
 * @private
 */
Display.prototype.processAndRenderTableData = function() {
    this.clearTable();

    var tableData = this.origData['searchResult'];
    var hiddenWords = this.hiddenWords;
    var self = this;

    // deal with year from and to function
    tableData = tableData.filter(function(ele) {
        var fileName = searcher.getLocById(ele[0]);
        var year = parseInt(fileName.slice(0, 4));
        var fromSatisfied = self.yearRange[0] === null || self.yearRange[0] <= year + 1;
        var toSatisfied = self.yearRange[1] === null || self.yearRange[1] >= year;
        return fromSatisfied && toSatisfied;
        // recompute score based on the hiddenWords
    }).map(function(ele) {
        ele = ele.slice();
        ele[1] = ele[1].reduce(function(acc, cur, idx) {
            return acc + cur * !hiddenWords[idx];
        }, 0);
        return ele;
        // get rid of those ones with zero score i.e. those ones that do not have results
    }).filter(function(ele) {
        return ele[1];
    });

    var sortingOpt = this.getSortingOption();
    var sortingDirection = 1 - (sortingOpt[1] === 'up') * 2;
    tableData.sort(function(a, b) {
        return (b[sortingOpt[0]] - a[sortingOpt[0]]) * sortingDirection;
    });
    this.tableData = tableData;
    this.renderedResults = 0;
    context.feedData(tableData, hiddenWords);
    this.renderResults();
}

/**
 * @private
 * @returns {[string, string]}
 */
Display.prototype.getSortingOption = function() {
    var sorting = this.currentSorting;
    return [sorting.dataset.index, sorting.classList.item(1)];
}

/**
 * Applies new constraints by rerendering the table. Maybe it would be more
 * efficient if some reources is preserverd, but since it only renders first
 * fifty of them, I guess it shouldn't matter that much.
 * @private
 */
Display.prototype.refreshTable = function() {
    this.processAndRenderTableData();
}

/**
 * Renders results from filtered data. It uses processors, which made this
 * function a bit abstract, but also lost some resource sharing abilities. I
 * will need to find a way to improve this.
 * @private 
 */
Display.prototype.renderResults = function() {
    var data = this.tableData;
    var singleRender = 50;
    var renderedResults = this.renderedResults;

    var frag = document.createDocumentFragment();
    for (var i = renderedResults; i < renderedResults + singleRender; i++) {
        if (!data[i])
            break;
        var row = document.createElement('tr');
        row.dataset.id = data[i][0];
        frag.appendChild(row);
        for (var j in data[i]) {

            if (this.dataRenderProcessors[j] !== false) {
                var td = document.createElement('td');
                row.appendChild(td);
                if (this.dataRenderProcessors[j]) {
                    this.dataRenderProcessors[j](data[i][j], td, this);
                } else {
                    td.innerHTML = data[i][j];
                }
            }
        }
    }
    if (i === 0) {
        i++;
        this.renderPlaceHolder('No Results :(');
    }
    this.table.appendChild(frag);
    this.renderedResults = i;
}

/**
 * Generates the index plot for each search term
 * @private
 * @param {resultDetails} data see `Searcher.search` for more info
 * @returns {HTMLElement}
 */
Display.prototype.generateIndexPlot = function(data) {
    var box = el('div', null, 'indexPlot');
    var svg = els('svg', box);
    attr(svg, 'xmlns', 'http://www.w3.org/2000/svg');
    attr(svg, 'viewBox', '0 0 250 16');
    attr(svg, 'preserveAspectRatio', 'none');

    var hiddenWords = this.hiddenWords;
    var fullWidthArticleLength = searcher.getArticleLength95();
    var currentArticleLength = data['articleLength'];
    var currentPlotWidthPercent = Math.min(1, currentArticleLength / fullWidthArticleLength);
    var totTerm = hiddenWords.reduce(function(acc, cur) {
        return acc + !cur * 1;
    }, 0);
    // for computing y
    var currDisplayIndex = 0;

    data['searchTermIndex'].forEach(function(term, idx) {
        if (hiddenWords[idx])
            return;
        var termWrapper = els('g', svg, 'term term-' + idx);
        term.forEach(function(index) {
            var percentInArticle = index / currentArticleLength;
            var xPos = (percentInArticle * 100 * currentPlotWidthPercent).toFixed(3) + '%';
            var y1 = (currDisplayIndex / totTerm * 100).toFixed(3) + '%';
            var y2 = ((currDisplayIndex + 1) / totTerm * 100).toFixed(3) + '%';

            var bar = els('line', termWrapper, 'bar');

            attr(bar, 'x1', xPos);
            attr(bar, 'x2', xPos);
            attr(bar, 'y1', y1);
            attr(bar, 'y2', y2);
        });
        currDisplayIndex++;
    });

    var cursor = els('line', svg, 'cursor');
    // for supporting ie 11, which does not have get by class name
    attr(cursor, 'id', 'cursor');
    attr(cursor, 'y1', 0);
    attr(cursor, 'y2', '100%');

    var border = els('rect', svg);
    attr(border, 'width', Math.round(currentPlotWidthPercent * 250));
    attr(border, 'height', '100%');

    border.addEventListener('mouseover', context.enter.bind(context));
    border.addEventListener('touchstart', context.enter.bind(context), {
        passive: true
    });
    border.addEventListener('mousemove', context.move.bind(context));
    border.addEventListener('touchmove', context.move.bind(context), {
        passive: true
    });
    border.addEventListener('mouseout', context.leave.bind(context));
    border.addEventListener('touchend', context.leave.bind(context));

    border.addEventListener('mousedown', context.clickListener.bind(context));

    return box;
}

/**
 * This is a bad design. Though it made processing discrete, it also made it
 * hard to share some resources. I will need to look at more web applications or
 * frameworks to find out a more elegant yet powerful way to do this.
 * @private
 */
Display.prototype.dataRenderProcessors = [function(data, ele) {
    var a = el('a', ele);
    a.target = '_blank';
    data = searcher.getLocById(data);
    a.innerHTML = data;
    a.href = '../' + data;
    a.title = data;
}
, null, function(data, ele, self) {
    ele.appendChild(self.generateIndexPlot(data));
}
];

/**
 * Renders a placeholder at the end of the result table
 * @public
 * @param {string} text the text to show on the placeholder
 */
Display.prototype.renderPlaceHolder = function(text) {
    var row = el('tr', this.table);
    var cell = el('td', row, 'placeHolder');
    attr(cell, 'colspan', '3');
    cell.innerHTML = text;
}

/**
 * Sets the year constraint. Note that two digit year will get added by 1900
 * @public
 * @param {string} input a string that represents a year or null 
 * @param {string} type whether it is from or to year constraint
 */
Display.prototype.changeDisplayYearRange = function(input, type) {
    var idx = (type === 'to') * 1;
    var parsed;
    if (input === '') {
        parsed = null;
    } else {
        var parsed = parseInt(input);
        parsed = (0 <= parsed && parsed < 100) ? 1900 + parsed : parsed;
    }
    this.yearRange[idx] = parsed;
    this.refreshTable();
    return parsed;
}

// i'm too lazy to change this...
var inputs = [{
    label: 'Exact Matching:',
    properties: {
        type: 'checkbox'
    },
    events: {
        change: function(e) {
            searcher.setOptions({
                matchExact: e.target.checked
            });
            var val = display.searchBar.value;
            if (/^".*"$/.test(val) && e.target.checked) {
                display.searchBar.value = val.slice(1, val.length - 1);
            }
            doSearch();
        }
    }
}, {
    label: 'Year From:',
    properties: {
        type: 'number',
        pattern: '\\d*'
    },
    events: {
        change: function(e) {
            e.target.value = display.changeDisplayYearRange(e.target.value, 'from');
        }
    }
}, {
    label: 'Year To:',
    properties: {
        type: 'number',
        pattern: '\\d*'
    },
    events: {
        change: function(e) {
            e.target.value = display.changeDisplayYearRange(e.target.value, 'to');
        }
    }
}, {
    label: '',
    class: 'showAll',
    properties: {
        type: 'button',
        value: 'Show All...'
    },
    events: {
        click: function(e) {
            e.currentTarget.parentNode.parentNode.classList.add('showAdvanced');
        }
    }
}, {
    label: 'Special Syntax Case Sensitive:',
    class: 'advanced',
    properties: {
        type: 'checkbox',
    },
    events: {
        change: function(e) {
            searcher.setOptions({
                caseSensitive: e.target.checked
            });
            doSearch();
        }
    }
}]
