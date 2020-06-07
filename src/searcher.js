(function SearcherFactory() {
    function Searcher(isWorker) {
        this.isWorker = isWorker;
        this.text = null;
        this.origIndex = {};
        this.stemIndex = {};
        this.articleInfo = [];
        this.previousSearch = {
            result: [],
            contextLengthDecider: []
        };
        this.options = {
            caseSensitive: false,
            matchExact: false,
        };

        // for storing user defined objects
        this.customStorage = {};

        // could've created a new class, but i'm too lazy to do that
        this.eventListeners = {};

        this.commonRegex = {
            wordExtractor: /\b[^\s\u2010-\u2015\-\/]+\b/gi,
            nonWordCharacters: /[^a-z0-9]/gi,
            dblQuote: /["\u201C\u201D]/g,
            sglQuote: /['\u2018\u2019]/g
        }

        this.stemmer = this.createStemmer();

        if (!isWorker && Worker && URL && URL.createObjectURL) {
            this.workers = new WorkerManager(SearcherFactory);
        }

    }

    Searcher.prototype.search = function(query) {

        if (!query)
            return;

        if (this.workers) {
            this.workers.postCommand('search', this.handleSearchResultFromWorkers.bind(this), {
                query: query,
            });
            return;
        }

        this.previousSearch.result = [];
        this.previousSearch.contextLengthDecider = [];

        function searchInOrigIndex(terms) {
            var origIndex = self.origIndex;
            var allResults = terms.map(function(term) {
                return origIndex[term] || [];
            });

            // actually, i suspect that using naive 'sort' is faster here, as sort is implemented internally
            function mergeTwo(a1, a2) {
                var a1idx = 0;
                var a2idx = 0;
                var out = [];
                while (a1idx < a1.length && a2idx < a2.length) {
                    var cur = a1[a1idx] > a2[a2idx] ? a2[a2idx++] : a1[a1idx++];
                    out.push(cur);
                }
                return out.concat(a1.slice(a1idx, a1.length), a2.slice(a2idx, a2.length));
            }

            while (allResults.length > 1) {
                var next = [];
                for (var i = 0; i < allResults.length; i += 2) {
                    next.push(mergeTwo(allResults[i], allResults[i + 1] || []));
                }
                allResults = next;
            }
            return allResults[0] || [];
        }

        var searchFunctions = {
            exact: function(term) {
                // there's actually a way to use the invertedIndex,
                // but i want to handle punctuation marks as well
                var text = self.text;
                var flags = self.options.caseSensitive ? 'g' : 'ig';
                // make term regex safe
                term = term.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
                // prepare quotation marks
                term = term.replace('"', self.commonRegex.dblQuote.source);
                term = term.replace("'", self.commonRegex.sglQuote.source);
                if (/^\w[\w ]+\w$/.test(term))
                    term = '\\b' + term + '\\b';
                var re = new RegExp(term,flags);
                var results = [];
                var result;
                while ((result = re.exec(text))) {
                    results.push(result.index);
                }
                return results;
            },
            partialExact: function(term) {
                term = term.replace(self.commonRegex.nonWordCharacters, '');
                var stemmed = self.stemmer(term);
                var origForms = self.stemIndex[stemmed] || [];
                var searchArr = [stemmed].concat(origForms).filter(function(q) {
                    q = q.replace(self.commonRegex.nonWordCharacters, '');
                    if (self.options.caseSensitive) {
                        return q === term;
                    } else {
                        return q.toLowerCase() === term.toLowerCase();
                    }
                });

                return searchInOrigIndex(searchArr);
            },
            regular: function(term) {
                term = term.replace(self.commonRegex.nonWordCharacters, '');
                var stemmed = self.stemmer(term);
                var origForms = self.stemIndex[stemmed] || [];
                var searchArr = [stemmed].concat(origForms);
                return searchInOrigIndex(searchArr);
            },
            extraRegular: 'regular'
        };
        searchFunctions.extraRegular = searchFunctions.regular;

        var self = this;

        var queryArr = this.parseQuery(query);
        var stopWordsToBeRemoved = queryArr.map(function(_) {
            return false;
        });

        var keywords = {};
        var keywordOrder = {};
        var indices = {};

        var resultIndices, sortingOrder;

        var result = {};

        // initialize all dicts:
        var populateDict = [keywords, keywordOrder, indices];
        var categories = ['exact', 'partialExact', 'regular', 'extraRegular'];
        populateDict.forEach(function(d) {
            categories.forEach(function(c) {
                d[c] = [];
            });
        });

        // fill data into dicts
        queryArr.forEach(function(obj, i) {
            keywords[obj.tag].push(obj.term);
            keywordOrder[obj.tag].push(i);
        });

        // create extra query by combining two regular words that are next to each other
        // for dealing with compound words. For example, "text box" is interchangealbe with "textbox"
        for (var i in keywords.regular) {
            i = parseInt(i);
            if (keywordOrder.regular[i] + 1 === keywordOrder.regular[i + 1]) {
                keywords.extraRegular.push(keywords.regular[i] + keywords.regular[i + 1]);
                keywordOrder.extraRegular.push(i);
            }
        }

        // do search
        for (var i in keywords) {
            indices[i] = keywords[i].map(searchFunctions[i]);
        }

        // put compound word results back to their original words
        indices.extraRegular.forEach(function(result, i) {
            var idx = [0, 0];
            var corrRegularIndex = keywordOrder.extraRegular[i];
            var arrs = [indices.regular[corrRegularIndex], indices.regular[corrRegularIndex + 1]];
            var k = arrs[0].length > arrs[1].length ? 1 : 0;

            result.forEach(function(num) {
                while (arrs[k][idx[k]] < num)
                    idx[k]++;
                arrs[k].splice(idx[k], 0, num);

                k = !k * 1;
            });
        });

        delete indices.extraRegular;

        // recommend removing stopwords 
        // removal based on: if a word is a stopword, and it has at least two times matches
        // as an average keyword (total results / number of keywords), then mark it as removed,
        // and repeat the process until no stopword is occupying too much search result space
        var totalResults = 0;

        for (var i in indices) {
            indices[i].forEach(function(rst) {
                totalResults += rst.length;
            });
        }
        var stopWords = ['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought', "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't", "shan't", "shouldn't", "can't", 'cannot', "couldn't", "mustn't", "let's", "that's", "who's", "what's", "here's", "there's", "when's", "where's", "why's", "how's", 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'];
        var stopWordsInQuery = [];
        var queryLength = queryArr.length;

        indices.regular.forEach(function(rst, idx) {
            if (stopWords.indexOf(keywords.regular[idx].toLowerCase()) !== -1) {
                stopWordsInQuery.push([rst.length, keywordOrder.regular[idx]]);
            }
        });
        var currentStopWordListLength;
        while (currentStopWordListLength !== stopWordsInQuery.length) {
            currentStopWordListLength = stopWordsInQuery.length;
            for (var i = stopWordsInQuery.length - 1; i >= 0; i--) {
                var entry = stopWordsInQuery[i];
                if (entry[0] > totalResults / queryLength * 2) {
                    queryLength--;
                    totalResults -= entry[0];
                    stopWordsToBeRemoved[entry[1]] = true;
                    stopWordsInQuery.splice(i, 1);
                }
            }
        }

        // combine all results based on the origianl order
        // O(n^2) algo, but i don't really care
        resultIndices = indices.exact.concat(indices.partialExact, indices.regular);
        sortingOrder = keywordOrder.exact.concat(keywordOrder.partialExact, keywordOrder.regular);
        resultIndices = resultIndices.map(function(_, idx, arr) {
            return arr[sortingOrder.indexOf(idx)];
        });

        // populate result: each entry in result corresponds to an article
        // and that entry has each word's relative positions to the beginning
        // of each article 
        var articleIndices = this.articleInfo[0];
        resultIndices.forEach(function(wordIndices, wordPosition) {
            self.convertToTargetIndex(wordIndices, articleIndices).forEach(function(currArticleIndex, idx) {
                if (!result[currArticleIndex]) {
                    var arr = [];
                    // don't want to use fill cuz some browsers won't support this
                    for (var i = 0; i < resultIndices.length; i++) {
                        arr.push([]);
                    }
                    result[currArticleIndex] = arr;
                }
                result[currArticleIndex][wordPosition].push(wordIndices[idx] - articleIndices[currArticleIndex]);

            });
        });

        // ensure that exact keywords are all present in the result
        for (var i in result) {
            if (!keywordOrder.exact.map(function(j) {
                return result[i][j];
            }).reduce(function(acc, cur) {
                return acc && cur.length;
            }, true))
                delete result[i];
        }

        // generate output array: each element has the following format:
        // [articleId, articleScore, resultDetails]
        // score is the sum of all occurrences with one rule: 
        // each number cannot be larger than 2 * (minimum occurrences + 1)
        // so that common words like 'is' won't be the only thing that it's measuring
        var output = [];
        for (var i in result) {
            var occuArr = result[i].map(function(occu) {
                return occu.length;
            });
            var minOccu = Math.min.apply(null, occuArr) + 1;
            var weightedCount = occuArr.map(function(count) {
                return Math.min(minOccu * 2, count);
            });

            var resultDetails = {
                searchTermIndex: result[i],
                articleLength: this.getArticleLength(i)
            }

            output.push([parseInt(i), weightedCount, resultDetails]);
        }

        // for displaying variables
        var queryDisplay = queryArr.map(function(obj) {
            var wrapper = '';
            if (obj.tag === 'exact') {
                wrapper = '"';
            } else if (obj.tag === 'partialExact') {
                wrapper = "'";
            }
            return wrapper + obj.term + wrapper;
        });

        // context length of each search term will be decided by this
        this.previousSearch.contextLengthDecider = queryArr.map(function(obj) {
            if (obj.tag === 'exact') {
                return obj.term.length;
            } else {
                return self.commonRegex.wordExtractor;
            }
        });
        this.previousSearch.result = result;

        var rtn = {
            searchResult: output,
            searchTerms: queryDisplay,
            stopWords: stopWordsToBeRemoved
        };
        this.emitEvent('searchFinished', rtn);
        return rtn;
    }

    Searcher.prototype.parseQuery = function(query) {

        var queryArr = [];

        // replace special quotation marks: “”‘’
        query = query.replace(this.commonRegex.sglQuote, "'").replace(this.commonRegex.dblQuote, '"');

        // separate exact vs regular keywords
        if (this.options.matchExact) {
            queryArr.push({
                term: query,
                tag: 'exact'
            })
        } else {
            function encapsulatePortion(queryArr, re, tag) {
                var out = [];
                var idx = 0;
                var rst;

                queryArr.forEach(function(query) {
                    if (typeof query === 'object') {
                        out.push(query);
                        return;
                    }
                    while (rst = re.exec(query)) {
                        out.push(query.slice(idx, rst.index));
                        idx += rst.index + rst[0].length;
                        out.push({
                            term: rst[rst.length - 1],
                            tag: tag
                        });
                    }
                    out.push(query.slice(idx, query.length));
                });
                return out;
            }

            // extract exact words or phrases noted by ""
            // they must appear in every search result
            var exactExtractor = /"(.*?)"/g;
            var partialExactExtractor = /'(.*?)'/g;
            var wordExtractor = this.commonRegex.wordExtractor;

            queryArr.push(query);
            queryArr = encapsulatePortion(queryArr, exactExtractor, 'exact');
            queryArr = encapsulatePortion(queryArr, partialExactExtractor, 'partialExact');
            queryArr = encapsulatePortion(queryArr, wordExtractor, 'regular');

            // breaking partialExact into words
            var temp = [];
            for (var i in queryArr) {
                var obj = queryArr[i];
                if (obj.tag === 'partialExact') {
                    encapsulatePortion([obj.term], wordExtractor, 'partialExact').forEach(function(o) {
                        temp.push(o);
                    });
                } else {
                    temp.push(obj);
                }
            }
            queryArr = temp;

            queryArr = queryArr.filter(function(ele) {
                if (typeof ele === 'string') {
                    return false;
                }
                var query = ele.term;
                return query.trim();
            });
        }
        return queryArr;
    }

    Searcher.prototype.handleSearchResultFromWorkers = function(rtn) {
        var combinedSearchResult = [];
        var combinedStopWords = [];
        for (var i in rtn) {
            var articleResult = rtn[i]['searchResult'];
            for (var j in articleResult) {
                articleResult[j][0] += this.workers.status.startingArticleIndex[i];
                combinedSearchResult.push(articleResult[j]);
            }
            combinedStopWords = rtn[i]['stopWords'].map(function(ele, idx) {
                return ele || combinedStopWords[idx];
            });
        }
        rtn[0]['searchResult'] = combinedSearchResult;
        rtn[0]['stopWords'] = combinedStopWords;
        this.emitEvent('searchFinished', rtn[0]);
    }

    // assuming the range is computed correctly
    Searcher.prototype.getContext = function(articleId, range) {
        var self = this;
        if (this.workers) {
            var workerArticleIndex = this.workers.status.startingArticleIndex;
            var assignedWorker = this.convertToTargetIndex([articleId], workerArticleIndex)[0];
            function handle(rst) {
                self.emitEvent('contextFinished', rst[assignedWorker]);
            }
            var splittedPayload = Array(this.workers.numofWorkers);
            splittedPayload[assignedWorker] = [articleId - workerArticleIndex[assignedWorker], range];
            this.workers.postCommand('getContext', handle, null, splittedPayload);
            return;
        }

        var results = this.previousSearch.result[articleId] || []
          , contextLengthDecider = this.previousSearch.contextLengthDecider
          , articleStart = this.articleInfo[0][articleId]
          , st = range[0]
          , fi = range[1]
          , context = this.text.slice(st + articleStart, fi + articleStart)
          , stWord = /^\w*\W*\b/.exec(context)
          , fiWord = /\b\W*\w*$/.exec(context);

        var rtn;

        if (stWord && fiWord) {
            context = context.slice(stWord[0].length, context.length - fiWord[0].length).replace(/[\u001c\u001d]/g, '|');
            // start, finish are relative to the article
            var start = st + stWord[0].length;
            var finish = fi - fiWord[0].length;
            var searchTerms = [];

            results.forEach(function(result, term) {
                result.forEach(function(idx) {
                    if (start <= idx && idx < finish) {
                        // i would like to convert it so that they are relative to 
                        // the context string instead
                        searchTerms.push([idx - start, term]);
                    }
                });
            });
            searchTerms.sort(function(a, b) {
                return a[0] - b[0];
            });
            searchTerms = searchTerms.map(function(e, idx, arr) {
                var startIndex = e[0];
                var term = e[1];
                var endIndex;
                if (typeof contextLengthDecider[term] === 'object') {
                    contextLengthDecider[term].lastIndex = startIndex;
                    endIndex = startIndex + contextLengthDecider[term].exec(context)[0].length;
                    // this is a must when working with regex (and probably why regex breaks people's codes, which 
                    // it did on mine)
                    contextLengthDecider[term].lastIndex = 0;
                } else {
                    endIndex = startIndex + contextLengthDecider[term];
                }
                if (arr[idx + 1] !== undefined) {
                    endIndex = Math.min(endIndex, arr[idx + 1][0]);
                }
                return [startIndex, endIndex, term];
            });
            rtn = [context, searchTerms, [start, finish]];
        } else {
            rtn = ['', [], range];
        }
        this.emitEvent('contextFinished', rtn);
        return rtn;
    }

    Searcher.prototype.setOptions = function(options) {
        if (this.workers) {
            this.workers.postCommand('setOptions', null, {
                options: options
            });
        }
        for (var i in options) {
            this.options[i] = options[i];
        }
    }

    Searcher.prototype.feedText = function(text) {
        this.articleInfo = this.gatherArticleInfo(text);

        if (this.workers) {
            var splitIndex = [];
            var totLen = text.length;
            var workerNum = this.workers.numofWorkers;

            // evenly distribute the archive among workers
            for (var i = 0; i < totLen; i += totLen / workerNum) {
                splitIndex.push(i);
            }

            // move each index to the beginning of articles,
            // so workers will have full articles 
            var articleIndices = this.articleInfo[0];
            var splitArticleIndex = this.convertToTargetIndex(splitIndex, articleIndices);

            this.workers.status.startingArticleIndex = splitArticleIndex;

            var splittedText = [];
            for (var i = 0; i < workerNum; i++) {
                splittedText.push(text.slice(articleIndices[splitArticleIndex[i]], articleIndices[splitArticleIndex[i + 1]]));
            }
            this.workers.postCommand('feedText', this.workersReady.bind(this), null, splittedText);
            return;
        }

        this.text = text;
        this.buildInvertedIndex();
        this.emitEvent('indexReady');
    }

    Searcher.prototype.buildInvertedIndex = function() {
        console && console.time && console.time('building lib');

        var text = this.text;
        var wordExtractor = this.commonRegex.wordExtractor;
        var nonWordCharacters = this.commonRegex.nonWordCharacters;
        var stemmer = this.stemmer;
        var origIndex = {};

        // actually, this is the inverse of stemmer function, except for that its range
        // is words in the original text, not indices of any kind
        var stemIndex = {};

        var result, word;

        while ((result = wordExtractor.exec(text))) {
            // it turns out that I cannot find a way to apply this on the 
            // entire string without changing the position of each word.
            // One can change this line to support more languages
            word = result[0];
            if (word) {
                var dictEntry = origIndex[word];
                if (!dictEntry) {
                    dictEntry = [];
                    origIndex[word] = dictEntry;
                }
                dictEntry.push(result.index);
            }
        }

        var checkContainsNumberRe = /\d/;
        for (var i in origIndex) {

            // if a word contains number, it's rather meaningless to stem it
            if (checkContainsNumberRe.test(i)) {
                continue;
            }

            var stemmed = stemmer(i.replace(nonWordCharacters, ''));

            if (stemmed === i) {
                continue;
            }

            if (!stemIndex[stemmed]) {
                stemIndex[stemmed] = [];
            }
            stemIndex[stemmed].push(i);
        }

        this.stemIndex = stemIndex;
        this.origIndex = origIndex;

        console && console.timeEnd && console.timeEnd('building lib');
    }

    Searcher.prototype.gatherArticleInfo = function(text) {
        var fileStructureRe = /\u001c(.*?)\u001d/g;
        var idx = [];
        var loc = [];
        var result;
        while ((result = fileStructureRe.exec(text))) {
            // a memory trick so your browser can release text correctly
            loc.push((' ' + result[1]).slice(1));
            idx.push(result.index);
        }

        // this turns out to be beneficial in multiple settings
        idx.push(text.length);

        // release memory
        fileStructureRe.exec('\u001cabc\u001d');

        return [idx, loc];
    }

    Searcher.prototype.getArticleLength = function(id) {
        id = parseInt(id);
        var idx = this.articleInfo[0];
        var end = idx[id + 1];
        // || this.text.length;
        return end - idx[id];
    }

    Searcher.prototype.getLocById = function(id) {
        return this.articleInfo[1][id];
    }

    Searcher.prototype.getArticleLength95 = function() {
        if (this.customStorage.articleLength95 !== undefined) {
            return this.customStorage.articleLength95;
        }
        var self = this;
        var loc = this.articleInfo[1];
        var articleLengths = loc.map(function(_, id) {
            return self.getArticleLength(id);
        });
        articleLengths.sort(function(a, b) {
            return a - b;
        });
        var percentile95 = articleLengths[Math.floor(loc.length * 0.95)];

        this.customStorage.articleLength95 = percentile95;
        return percentile95;
    }

    Searcher.prototype.registerEventListener = function(event, callback) {
        if (!this.eventListeners[event])
            this.eventListeners[event] = [];
        this.eventListeners[event].push(callback);
    }

    Searcher.prototype.emitEvent = function(event, obj) {
        if (this.eventListeners[event])
            this.eventListeners[event].forEach(function(f) {
                f(obj);
            });
    }

    Searcher.prototype.workersReady = function() {
        this.emitEvent('indexReady');
    }

    Searcher.prototype.createStemmer = function() {
        // https://github.com/words/lancaster-stemmer
        var stop = -1
        var intact = 0
        var cont = 1
        var protect = 2
        var vowels = /[aeiouy]/

        // each innermost array was {match: arr[0], replacement: arr[1], type: arr[2]}
        // i changed it so that the code looks more compact
        var rules = {
            "a": [["ia", "", intact], ["a", "", intact]],
            "b": [["bb", "b", stop]],
            "c": [["ytic", "ys", stop], ["ic", "", cont], ["nc", "nt", cont]],
            "d": [["dd", "d", stop], ["ied", "y", cont], ["ceed", "cess", stop], ["eed", "ee", stop], ["ed", "", cont], ["hood", "", cont]],
            "e": [["e", "", cont]],
            "f": [["lief", "liev", stop], ["if", "", cont]],
            "g": [["ing", "", cont], ["iag", "y", stop], ["ag", "", cont], ["gg", "g", stop]],
            "h": [["th", "", intact], ["guish", "ct", stop], ["ish", "", cont]],
            "i": [["i", "", intact], ["i", "y", cont]],
            "j": [["ij", "id", stop], ["fuj", "fus", stop], ["uj", "ud", stop], ["oj", "od", stop], ["hej", "her", stop], ["verj", "vert", stop], ["misj", "mit", stop], ["nj", "nd", stop], ["j", "s", stop]],
            "l": [["ifiabl", "", stop], ["iabl", "y", stop], ["abl", "", cont], ["ibl", "", stop], ["bil", "bl", cont], ["cl", "c", stop], ["iful", "y", stop], ["ful", "", cont], ["ul", "", stop], ["ial", "", cont], ["ual", "", cont], ["al", "", cont], ["ll", "l", stop]],
            "m": [["ium", "", stop], ["um", "", intact], ["ism", "", cont], ["mm", "m", stop]],
            "n": [["sion", "j", cont], ["xion", "ct", stop], ["ion", "", cont], ["ian", "", cont], ["an", "", cont], ["een", "", protect], ["en", "", cont], ["nn", "n", stop]],
            "p": [["ship", "", cont], ["pp", "p", stop]],
            "r": [["er", "", cont], ["ear", "", protect], ["ar", "", stop], ["ior", "", cont], ["or", "", cont], ["ur", "", cont], ["rr", "r", stop], ["tr", "t", cont], ["ier", "y", cont]],
            "s": [["ies", "y", cont], ["sis", "s", stop], ["is", "", cont], ["ness", "", cont], ["ss", "", protect], ["ous", "", cont], ["us", "", intact], ["s", "", cont], ["s", "", stop]],
            "t": [["plicat", "ply", stop], ["at", "", cont], ["ment", "", cont], ["ent", "", cont], ["ant", "", cont], ["ript", "rib", stop], ["orpt", "orb", stop], ["duct", "duc", stop], ["sumpt", "sum", stop], ["cept", "ceiv", stop], ["olut", "olv", stop], ["sist", "", protect], ["ist", "", cont], ["tt", "t", stop]],
            "u": [["iqu", "", stop], ["ogu", "og", stop]],
            "v": [["siv", "j", cont], ["eiv", "", protect], ["iv", "", cont]],
            "y": [["bly", "bl", cont], ["ily", "y", cont], ["ply", "", protect], ["ly", "", cont], ["ogy", "og", stop], ["phy", "ph", stop], ["omy", "om", stop], ["opy", "op", stop], ["ity", "", cont], ["ety", "", cont], ["lty", "l", stop], ["istry", "", stop], ["ary", "", cont], ["ory", "", cont], ["ify", "", stop], ["ncy", "nt", cont], ["acy", "", cont]],
            "z": [["iz", "", cont], ["yz", "ys", stop]]
        }

        // Detect if a value is acceptable to return, or should be stemmed further.
        function acceptable(value) {
            return vowels.test(value.charAt(0)) ? value.length > 1 : value.length > 2 && vowels.test(value)
        }

        function applyRules(value, isintact) {
            var ruleset = rules[value.charAt(value.length - 1)]
            var breakpoint
            var index
            var length
            var rule
            var next

            if (!ruleset) {
                return value
            }

            index = -1
            length = ruleset.length

            while (++index < length) {
                rule = ruleset[index]

                if (!isintact && rule[2] === intact) {
                    continue
                }

                breakpoint = value.length - rule[0].length

                if (breakpoint < 0 || value.slice(breakpoint) !== rule[0]) {
                    continue
                }

                if (rule[2] === protect) {
                    return value
                }

                next = value.slice(0, breakpoint) + rule[1]

                if (!acceptable(next)) {
                    continue
                }

                if (rule[2] === cont) {
                    return applyRules(next, false)
                }

                return next
            }

            return value
        }
        return function lancasterStemmer(value) {
            return applyRules(String(value).toLowerCase(), true)
        }
    }
    Searcher.prototype.convertToTargetIndex = function(arr, target) {
        var index = 0;
        if (arr[0] < target[0]) {
            throw 'Invalid Input';
        }
        return arr.map(function(ele) {
            while (ele >= target[index + 1]) {
                index++;
            }
            return index;
        });
    }

    this.Searcher = Searcher;
}
).call(this);

function workerStarterCode() {
    this.id = -1;
    this.searcher = null;
    self.onmessage = function(event) {
        var rtn;
        var data = event.data;

        if (data.cmd === 'init') {
            id = data.payload;
            new Function(data.code.slice(data.code.indexOf("{") + 1, data.code.lastIndexOf("}"))).call(this);
            searcher = new Searcher(true);
        } else if (data.cmd === 'feedText') {
            searcher.feedText(data.payload);
        } else if (data.cmd === 'search') {
            rtn = searcher.search(data.query);
        } else if (data.cmd === 'getContext') {
            rtn = searcher.getContext.apply(searcher, data.payload);
        } else if (data.cmd === 'setOptions') {
            searcher.setOptions(data.options);
        }

        self.postMessage({
            'rtn': rtn,
            'id': id,
            'cmd': data.cmd,
        });
    }
}

function WorkerManager(factory) {
    var maxWorkers = 4;
    var numofWorkers = 2;
    if (navigator.hardwareConcurrency) {
        numofWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency);
    }

    this.numofWorkers = numofWorkers;
    this.jobQueue = [];
    this.workers = [];

    this.workersDone = numofWorkers;
    this.workersResult = Array(numofWorkers);
    this.callback = null;

    // to be changed by the parent
    this.status = {};

    var workerURL = this.generateWorkerURL();

    var ids = [];
    for (var i = 0; i < numofWorkers; i++) {
        var worker = new Worker(workerURL);
        worker.onmessage = this.handleWorkerMessage.bind(this);
        this.workers.push(worker);
        ids.push(i);
    }
    this.postCommand('init', null, {
        code: factory.toString()
    }, ids);
}
WorkerManager.prototype.generateWorkerURL = function() {
    return URL.createObjectURL(new Blob(['(' + workerStarterCode.toString() + ')();'],{
        type: 'text/javascript'
    }));
}
WorkerManager.prototype.postCommand = function(cmd, callback, options, splittedPayload) {
    if (this.workersDone !== this.numofWorkers) {
        this.jobQueue.push([cmd, callback, options, splittedPayload]);
        return;
    }
    this.workersDone = 0;
    this.callback = callback;
    var message = options || {};
    message.cmd = cmd;
    for (var i = 0; i < this.numofWorkers; i++) {
        if (splittedPayload) {
            if (splittedPayload[i] !== undefined) {
                message.payload = splittedPayload[i];
            } else {
                this.workersDone++;
                continue;
            }
        }
        this.workers[i].postMessage(message);
    }
}
WorkerManager.prototype.handleWorkerMessage = function(event) {
    var data = event.data;
    this.workersResult[data.id] = data.rtn;
    this.workersDone++;
    if (this.workersDone === this.numofWorkers) {
        if (this.callback) {
            this.callback(this.workersResult);
        }
        this.workersResult = Array(this.numofWorkers);
        this.callback = null;
        var job = this.jobQueue.shift();
        if (job) {
            this.postCommand.apply(this, job);
        }
    }
}
