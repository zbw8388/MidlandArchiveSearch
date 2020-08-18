(function SearcherFactory() {
    /**
     * Handles all searching-related functionalities
     * @constructor
     * @param {boolean} [isWorker=false] 
     */
    function Searcher(isWorker) {
        this.text = null;
        this.index = {};
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

        this.encoder = this.createEncoder();

        if (!isWorker && Worker && URL && URL.createObjectURL) {
            this.workers = new WorkerManager(SearcherFactory);
        }

    }
    /**
     * @typedef {{searchTermIndex: number[][], articleLength: number}} resultDetails
     */
    /**
     * Conduct searching based on the query. Please refer to the about page for
     * the query syntax.
     * @public
     * @param {string} query 
     * @returns {{
     *   searchResult: [number, number[], resultDetails][], 
     *   searchTerms: string[], 
     *   stopWords: boolean[]
     *   }} 
     * In each element of searchResult, the first slot represents the
     * articleId, the second slot represents `weightedCount` for each parsed
     * search term, and the third slot represents detailed results, including
     * the length of the article, and the specific location of each occurence. 
     * @fires Searcher~searchFinished
     */
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
                while (result = re.exec(text)) {
                    results.push(result.index);
                }
                return results;
            },
            partialExact: function(term) {
                // idea: use the normal searching method, and then for each occurrence,
                // verify that it's actually partialExact, or it's actually spelled like
                // the original term
                var results = self.index[self.encoder(term)] || [];
                var wordExtractor = self.commonRegex.wordExtractor;
                var nonWordCharacters = self.commonRegex.nonWordCharacters;
                var caseSensitive = self.options.caseSensitive;
                var text = self.text;
                var wordInText;
                term = term.replace(nonWordCharacters, '');
                results = results.filter(function(idx) {
                    wordExtractor.lastIndex = idx;
                    wordInText = wordExtractor.exec(text)[0];
                    wordInText = wordInText.replace(nonWordCharacters, '');
                    if (caseSensitive) {
                        return wordInText === term;
                    } else {
                        return wordInText.toLowerCase() === term.toLowerCase();
                    }
                });
                wordExtractor.lastIndex = 0;
                return results;
            },
            regular: function(term) {
                // A shallow copy is necessary here as inserting extraRegular
                // (compound words) is through Array.splice, which modifies the
                // original array. For partialExact, the returning array does
                // not link to the index at all and they won't get extraRegular
                // anyways
                return (self.index[self.encoder(term)] || []).slice();
            }
        };

        var self = this;
        
        var result = {};
        
        var parsedQuery = this.parseQuery(query);

        // initialize each termObj and fill them with default values. I'm being
        // explicit here, but in theory I can just update existing objects
        var queryArr = parsedQuery.map(function(termObj) {
            return {
                term: termObj.term,
                tag: termObj.tag,
                indices: [],
                isStopWord: false,
                isClutteringStopWord: false,
            };
        });

        // do search
        queryArr.forEach(function(termObj) {
            termObj.indices = searchFunctions[termObj.tag](termObj.term);
        });

        // create extra query by combining two regular words that are next to
        // each other for dealing with compound words. For example, "text box"
        // is interchangealbe with "textbox".
        queryArr.forEach(function(termObj, idx, arr) {
            var nextTermObj = arr[idx + 1];
            // if two neighbour terms are both regular
            if (nextTermObj && nextTermObj.tag === termObj.tag && termObj.tag === 'regular') {
                // conduct a search just like regular ones
                var extraIndices = searchFunctions.regular(termObj.term + nextTermObj.term);
                
                // put compound word results back to their original terms
                [termObj.indices, nextTermObj.indices].forEach(function(termIndices) {
                    var index = 0;
                    extraIndices.forEach(function(num) {
                        while (termIndices[index] < num)
                            index++;
                        termIndices.splice(index, 0, num);
                    });
                });
            }
        });

        // recommend removing stopwords 
        // removal based on: if a word is a stopword, and it has at least two times matches
        // as an average keyword (total results / number of keywords), then mark it as removed,
        // and repeat the process until no stopword is occupying too much search result space
        var totalResults = 0;

        queryArr.forEach(function(termObj) {
            totalResults += termObj.indices.length;
        })

        var stopWords = ['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought', "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't", "shan't", "shouldn't", "can't", 'cannot', "couldn't", "mustn't", "let's", "that's", "who's", "what's", "here's", "there's", "when's", "where's", "why's", "how's", 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'];

        queryArr.forEach(function(termObj) {
            if (termObj.tag === 'regular' && stopWords.indexOf(termObj.term.toLowerCase()) !== -1)
                termObj.isStopWord = true;
        });

        var queryLength = queryArr.length;
        var stopLoop = false;
        var tooMuchThreshold;

        while (stopLoop = !stopLoop) {
            tooMuchThreshold = totalResults / queryLength * 2;
            queryArr.forEach(function(termObj) {
                if (termObj.isStopWord && !termObj.isClutteringStopWord && termObj.indices.length > tooMuchThreshold) {
                    // virtually removing this search term
                    queryLength--;
                    totalResults -= termObj.indices.length;
                    termObj.isClutteringStopWord = true;
                    stopLoop = false;
                }
            });
        }

        // populate result: each entry in result corresponds to an article
        // and that entry has each word's relative positions to the beginning
        // of each article 
        var articleIndices = this.articleInfo[0];
        queryArr.forEach(function(termObj, termPosition, arr) {
            var termIndices = termObj.indices;
            self.convertToTargetIndex(termIndices, articleIndices).forEach(function(currArticleIndex, idx) {
                if (!result[currArticleIndex]) {
                    var termIndicesInArticleArr = [];
                    // don't want to use fill cuz some browsers won't support this
                    for (var i = 0; i < arr.length; i++) {
                        termIndicesInArticleArr.push([]);
                    }
                    result[currArticleIndex] = termIndicesInArticleArr;
                }
                result[currArticleIndex][termPosition].push(termIndices[idx] - articleIndices[currArticleIndex]);
            });
        });

        // ensure that exact keywords are all present in the result
        for (var i in result) {
            if (!queryArr.map(function(termObj, idx) {
                return termObj.tag === 'exact'? result[i][idx] : -1;
            }).reduce(function(acc, cur) {
                return acc && (cur === -1 || cur.length);
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
            stopWords: queryArr.map(function(termObj) {return termObj.isClutteringStopWord})
        };
        /**
         * @event Searcher~searchFinished
         * @type {searchResult} see this method's return element
         */
        this.emitEvent('searchFinished', rtn);
        return rtn;
    }

    /**
     * Parse query. Please refer to the about page for
     * the query syntax.
     * @private 
     * @param {string} query
     * @returns {{term: string, tag: string}[]} a array of term and its
     * corresponding tag
     */
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

    /**
     * Merge results from workers
     * @private
     * @param {Array} rtn result from workers
     */
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

    /**
     * Gets the text context, existing search terms, and final range based on
     * the requested range. The text context will be cut off at complete words.
     * @public
     * @param {number} articleId 
     * @param {[number, number]} range the start and end of requested range.
     * Note it is subject to change when there's an unfinished word at the end
     * or the beginning of a sentence
     * @returns {[string, [number, number, number][], [number, number]]} the
     * result is a tuple. The first element represents the context. The second
     * element is an array of search keyword occurences in the said context. The
     * third element is the modified range.
     * @fires Searcher~contextFinished
     */
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
        /**
         * @event Searcher~contextFinished
         * @type {[string, [number, number, number][], [number, number]]}
         */
        this.emitEvent('contextFinished', rtn);
        return rtn;
    }

    /**
     * Sets options of the searcher
     * @public
     * @param {Object} options 
     */
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

    /**
     * Divides text up to workers if any and start building the inverted indexOf
     * @public
     * @param {string} text the data to perform any search on 
     * @fires Searcher~indexReady
     */
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
        /**
         * @event Searcher~indexReady
         */
        this.emitEvent('indexReady');
    }

    /**
     * Builds the inverted index. This is the most time consuming part of the
     * entire script.
     * @private
     */
    Searcher.prototype.buildInvertedIndex = function() {
        console && console.time && console.time('building lib');

        var text = this.text;
        var wordExtractor = this.commonRegex.wordExtractor;
        var encoder = this.encoder;
        var index = {};

        var encoderCache = {};

        var result, word, encoded;

        while (result = wordExtractor.exec(text)) {
            word = result[0];
            encoded = encoderCache[word];

            if (encoded === undefined) {
                encoded = encoder(word);
                encoderCache[word] = encoded;
            }

            if (encoded.length !== 0) {
                var dictEntry = index[encoded];
                if (dictEntry === undefined) {
                    dictEntry = [];
                    index[encoded] = dictEntry;
                }
                dictEntry.push(result.index);
            }
        }

        this.index = index;

        console && console.timeEnd && console.timeEnd('building lib');
    }

    /**
     * Finds the starting index of every issue as well as their relative
     * location based on the predefined file separation character
     * @private
     * @param {text} text
     * @returns {[number[], string[]]} 
     */
    Searcher.prototype.gatherArticleInfo = function(text) {
        var fileStructureRe = /\u001c(.*?)\u001d/g;
        var idx = [];
        var loc = [];
        var result;
        while (result = fileStructureRe.exec(text)) {
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

    /**
     * Returns the article length in the number of characters
     * @private
     * @param {number} id article id
     * @returns {number}
     */
    Searcher.prototype.getArticleLength = function(id) {
        id = parseInt(id);
        var idx = this.articleInfo[0];
        var end = idx[id + 1];
        // || this.text.length;
        return end - idx[id];
    }

    /**
     * Returns the starting index of a given article
     * @public
     * @param {number} id article id
     * @returns {number}
     */
    Searcher.prototype.getLocById = function(id) {
        return this.articleInfo[1][id];
    }

    /**
     * Returns the 95th percentile article length
     * @public
     * @returns {number}
     */
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

    /**
     * @public
     * @param {string} event the event to listen for
     * @param {Function} callback 
     */
    Searcher.prototype.registerEventListener = function(event, callback) {
        if (!this.eventListeners[event])
            this.eventListeners[event] = [];
        this.eventListeners[event].push(callback);
    }

    /**
     * @private
     * @param {string} event 
     * @param {*=} obj 
     */
    Searcher.prototype.emitEvent = function(event, obj) {
        if (this.eventListeners[event])
            this.eventListeners[event].forEach(function(f) {
                f(obj);
            });
    }

    /**
     * @private
     * @fires Searcher~indexReady
     */
    Searcher.prototype.workersReady = function() {
        this.emitEvent('indexReady');
    }

    /**
     * @private
     */
    Searcher.prototype.createEncoder = function() {
        var stemmer = this.createStemmer();
        var nonWordCharacters = this.commonRegex.nonWordCharacters;

        return function encode(word) {
            word = word.replace(nonWordCharacters, '');
            return stemmer(word);
        }
    }

    /**
     * Returns Lancaster stemmer
     * @private
     */
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

    /**
     * Converts each element of an array into the index of an element in the
     * target array that is largest among the ones that are smaller than the
     * said element in the original array. Note that both arrays must be sorted.
     * @example
     * // One usage is to determine the article id: Suppose I have a overall index:
     * // 75, and I would like to determine which article does it belong to (among
     * // articles that starts at [0, 50, 100, 150]), I can use:
     * this.convertToTargetIndex([75], [0, 50, 100, 150])
     * // returns [1]
     * @private
     * @param {number[]} arr 
     * @param {number[]} target 
     * @returns {number[]} converted index array
     */
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

/**
 * Provides basic functionality for workers to process requests
 * @function
 */
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

/**
 * Handles workers
 * @constructor
 * @param {function} factory the factory for searcher
 */
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

/**
 * @private
 * @returns {string}
 */
WorkerManager.prototype.generateWorkerURL = function() {
    return URL.createObjectURL(new Blob(['(' + workerStarterCode.toString() + ')();'],{
        type: 'text/javascript'
    }));
}

/**
 * Posts command to the worker. Commands are defined in the startCode. If a job
 * is currently executing, it will get placed in the job queue.
 * @public
 * @param {string} cmd command as defined in the starter code
 * @param {Function=} callback 
 * @param {Object=} options 
 * @param {Object[]=} splittedPayload payload that is different for each worker.
 * If they are the same, use options instead (honestly this is a horrible design
 * as the naming does not match the functionality)
 */
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

/**
 * Handles the message event and fires the callback once all workers are done.
 * Execute jobs from job queue if necessary.
 * @private
 * @param {MessageEvent} event 
 */
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
