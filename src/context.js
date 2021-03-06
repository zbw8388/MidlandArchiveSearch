/**
 * Manages the context bubble -- the one that appears once you hover over a bar
 * in the context section which provides the context around the "cursor"
 * @constructor
 */
function Context() {
    this.bubble = el('div', document.body, 'contextWrapper');
    var contextOverflowBlocker = el('div', this.bubble, 'contextOverflowBlocker')

    this.bubbleLocationIndicator = el('div', this.bubble, 'contextLocation');
    this.contextOverflowBlocker = contextOverflowBlocker;
    this.bubbleTextWrapperController = new ContextTextTrain(contextOverflowBlocker);

    this.SHOWBUBBLEWAITTIME = 400;

    this.bubbleWidth = null;

    this.bubbleArticleId = null;
    this.bubbleSvgWrapper = null;
    this.bubbleIndexInArticle = null;
    this.cursorInitiatedBubbleChange = false;
    this.prevRange = [null, null];
    this.turnPageMethod = 0;
    this.hitArticleEnd = 0;

    this.prevX = null;
    this.cursor = null;
    this.cursorSvgWrapper = null;
    this.cursorArticleId = null;
    this.cursorInitiatedArticleChangeHandled = false;
    this.cursorIndexInArticle = null;
    this.timeout = null;

    this.data = [];

    this.generateControl(contextOverflowBlocker);
    window.addEventListener('resize', this.closeBubbleListener.bind(this));
    document.addEventListener('mousedown', this.closeBubbleListener.bind(this));
    document.addEventListener('touchstart', this.closeBubbleListener.bind(this), {
        passive: true
    });
    searcher.registerEventListener('contextFinished', this.contextReady.bind(this));
}

/**
 * Initialize the four controls that occupy the corners of context bubbles for
 * users to navigate within an issue
 * @private
 * @param {HTMLElement} parent 
 */
Context.prototype.generateControl = function(parent) {
    var self = this;
    [['\u2039', '\u203a'], ['\u00ab', '\u00bb']].forEach(function(a, i) {
        a.forEach(function(inner, j) {
            var classString = 'contextControl ' + ['top ', 'bottom '][i] + ['left', 'right'][j];
            var control = el('div', parent, classString);
            el('span', control, 'contextControlIndicator').innerText = inner;
            new TouchMouseEventListener(control,self.controlListener,self);
        });
    });
}

/**
 * Sets up the cursor when the user starts interacting with bars in the context
 * section 
 * @public
 * @param {UIEvent} event 
 * @listens UIEvent
 */
Context.prototype.enter = function(event) {
    // removes the old cursor if it's still there
    if (this.cursor) {
        attr(this.cursor, 'class', 'cursor');
    }
    var svg = event.currentTarget.parentNode;
    this.cursorSvgWrapper = svg.parentNode;
    this.cursor = svg.getElementById('cursor');
    this.cursorArticleId = parseInt(svg.parentNode.parentNode.parentNode.dataset.id);
    this.cursorIndexInArticle = null;
    attr(this.cursor, 'class', 'cursor show');
    this.move(event);
}

/**
 * Moves the cursor inside context bar and starts a timeout for showing the
 * context around that cursor when the user moves finger or mouse
 * @public
 * @param {UIEvent} event 
 * @listens UIEvent
 */
Context.prototype.move = function(event) {
    if (!this.cursor)
        return;

    var x = Math.round(event.pageX || event.touches[0].pageX);

    if (x !== this.prevX) {

        this.prevX = x;

        // update cursor location
        var div = this.cursorSvgWrapper;
        var snapEpsilon = 5;

        var cursorArticleId = this.cursorArticleId;
        var currentArticle = this.data[cursorArticleId];
        var plotWidthPercent = currentArticle['plotWidthPercent'];
        var articleLength = currentArticle['articleLength'];

        var percentInSvg = (x - div.offsetLeft) / div.offsetWidth;
        percentInSvg = Math.max(0, Math.min(plotWidthPercent, percentInSvg));

        var cursorIndexInArticle = Math.round(percentInSvg / plotWidthPercent * articleLength);

        var cloestTermIndex = this.findCloestTermIndex(cursorArticleId, cursorIndexInArticle);
        var cloestTermIndexInArticle = currentArticle['termIndices'][cloestTermIndex];
        var cloestTermInSvg = cloestTermIndexInArticle / articleLength * plotWidthPercent;

        if (Math.abs(x - div.offsetLeft - cloestTermInSvg * div.offsetWidth) < snapEpsilon) {
            percentInSvg = cloestTermInSvg;
            cursorIndexInArticle = cloestTermIndexInArticle;
        }

        if (this.cursorIndexInArticle !== cursorIndexInArticle) {
            // current cursor article has been changed, remove context bubble
            // timeout
            clearTimeout(this.timeout);
            this.cursorInitiatedArticleChangeHandled = false;

            this.cursorIndexInArticle = cursorIndexInArticle;

            var percentInSvgText = (percentInSvg * 100).toFixed(2) + '%';
            attr(this.cursor, 'x1', percentInSvgText);
            attr(this.cursor, 'x2', percentInSvgText);

            this.createContextTimeout(cursorArticleId, cursorIndexInArticle, this.SHOWBUBBLEWAITTIME);
        }
    }
}

/**
 * Removes the cursor when user's gesture leaves the bar. It also detects the
 * touch click event, which shows the context 
 * @public
 * @param {UIEvent} event 
 * @listens UIEvent
 */
Context.prototype.leave = function(event) {
    if (this.cursor) {
        attr(this.cursor, 'class', 'cursor');
    }
    if (event.type === 'touchend') {
        var top = this.cursorSvgWrapper.offsetTop;
        // if touch left the screen out of the same element, we do not consider it a click
        if (top <= event.changedTouches[0].pageY && event.changedTouches[0].pageY <= top + this.cursorSvgWrapper.offsetHeight) {
            this.clickListener();
        }
    }
    this.prevX = null;
    this.cursorArticleId = null;
    this.cursorSvgWrapper = null;
    this.cursor = null;
}

/**
 * Creates a timeout for showing context around `cursorIndexInArticle`. The
 * context won't be displayed if user gesture has already left the bar after the
 * timeout.
 * @private
 * @param {number} cursorArticleId 
 * @param {number} cursorIndexInArticle 
 * @param {number} time 
 */
Context.prototype.createContextTimeout = function(cursorArticleId, cursorIndexInArticle, time) {
    var self = this;
    this.timeout = setTimeout(function() {
        if (self.cursorArticleId === cursorArticleId && self.cursorIndexInArticle === cursorIndexInArticle && !self.cursorInitiatedArticleChangeHandled) {
            self.getContext(cursorArticleId, cursorIndexInArticle, 0, true);
        }
    }, time);
}

/**
 * Displays the context around the cursor when the bar is clicked
 * @public
 * @listens UIEvent
 */
Context.prototype.clickListener = function() {
    if (!this.cursorInitiatedArticleChangeHandled) {
        this.getContext(this.cursorArticleId, this.cursorIndexInArticle, 0, true);
    }
}

/**
 * Shows user the context around `middleIndex` in article `articleId`. 
 *
 * This function computes the rough range of context and submits a `getContext`
 * request to `sercher` that will lead to displaying the context bubble. If the
 * result is already buffered, directly calls `showBubble`. If an article
 * argument is missing, it will get replaced by the status of current bubble.
 * @private
 * @param {number=} articleId 
 * @param {number=} middleIndex 
 * @param {number} [overlapDirection=0] the action (move back, do nothing, or
 * move forward the range) when there's an overlap between the requested article
 * range and currently displaying range
 * @param {boolean} [cursorInitiated=false] 
 */
Context.prototype.getContext = function(articleId, middleIndex, overlapDirection, cursorInitiated) {
    middleIndex = typeof middleIndex === 'number' ? middleIndex : this.bubbleIndexInArticle;
    articleId = typeof articleId === 'number' ? articleId : this.bubbleArticleId;
    overlapDirection = overlapDirection || 0;

    // cursor has initiated an article change
    if (this.bubbleArticleId !== articleId) {
        this.bubbleArticleId = articleId;
        this.bubbleIndexInArticle = null;
        this.prevRange = [null, null];
        this.bubbleSvgWrapper = this.cursorSvgWrapper;
    }

    var range = 200
      , articleLength = this.data[articleId]['articleLength']
      , st = middleIndex - range / 2
      , fi = middleIndex + range / 2
      , overlapExist = Math.min(fi, this.prevRange[1]) - Math.max(st, this.prevRange[0]) > 0;

    if (overlapExist) {
        if (overlapDirection > 0) {
            st = this.prevRange[1];
            fi = st + range;
        } else if (overlapDirection < 0) {
            fi = this.prevRange[0];
            st = fi - range;
        }
    }
    st = Math.max(0, st);
    fi = Math.min(articleLength, fi);

    this.hitArticleEnd = st === 0 ? -1 : fi === articleLength ? 1 : 0;
    this.turnPageMethod = overlapExist ? overlapDirection : 0;
    this.cursorInitiatedBubbleChange = cursorInitiated;
    this.cursorInitiatedArticleChangeHandled = true;

    if (overlapExist && this.bubbleTextWrapperController.pageExist(overlapDirection)) {
        this.showBubble();
    } else {
        searcher.getContext(articleId, [st, fi]);
    }
}
/**
 * Converts the `Searcher.getContext` result into an HTML element and passes it to
 * `showBubble` for display
 * @private
 * @param {[string, [number, number, number][], [number, number]]} data the
 * result from `Searcher.getContext`
 * @listens Searcher~contextFinished
 */
Context.prototype.contextReady = function(data) {
    var newText = el('div', null, 'contextText');
    var hiddenWords = this.data['hiddenWords'];
    var text = data[0];
    var sliceFrom = 0;

    if (this.hitArticleEnd !== -1)
        newText.appendChild(document.createTextNode('...'));
    data[1].forEach(function(interval) {
        newText.appendChild(document.createTextNode(text.slice(sliceFrom, interval[0])));
        var termText = text.slice(interval[0], interval[1]);
        if (!hiddenWords[interval[2]]) {
            var term = el('span', newText, 'contextTextKeyTerm term-' + interval[2]);
            term.innerText = termText
        } else {
            newText.appendChild(document.createTextNode(termText));
        }
        sliceFrom = interval[1];
    });
    newText.appendChild(document.createTextNode(text.slice(sliceFrom)));
    if (this.hitArticleEnd !== 1)
        newText.appendChild(document.createTextNode('...'));
    this.prevRange = data[2];
    this.showBubble(newText);
}

/**
 * Moves or reveals the bubble and updates the content within the bubble 
 * @private
 * @param {HTMLElement=} newText the new context for display. If ignored, it
 * will use buffered data
 */
Context.prototype.showBubble = function(newText) {
    var bubble = this.bubble;

    if (this.bubbleWidth === null) {
        // 2px for the border
        this.bubbleWidth = bubble.getBoundingClientRect().width - 2;
        this.bubbleTextWrapperController.setChildrenWidth(this.bubbleWidth);
    }

    // well, if it's not visiable on screnn, we can 'teleport' it to the current location
    // and to show a better animation
    if (!bubble.classList.contains('show')) {
        // hi ie 11!
        bubble.style.height = '';
        bubble.style.left = '';
        bubble.style.top = '';
        this.bubbleLocationIndicator.style.left = '';
    }

    this.bubbleTextWrapperController = this.bubbleTextWrapperController.movePage(this.turnPageMethod, [newText, this.prevRange], bubble.classList.contains('show'));
    newText = this.bubbleTextWrapperController.getCurrentItem()[0];
    this.prevRange = this.bubbleTextWrapperController.getCurrentItem()[1];

    var bubbleIndexInArticle = (this.prevRange[0] + this.prevRange[1]) >> 1;
    var percentInSvg = bubbleIndexInArticle / this.data[this.bubbleArticleId]['articleLength'] * this.data[this.bubbleArticleId]['plotWidthPercent'];
    var x = this.bubbleSvgWrapper.offsetLeft + this.bubbleSvgWrapper.offsetWidth * percentInSvg;

    var bubbleHeight = newText.offsetHeight;
    var bubbleWidth = bubble.offsetWidth;
    var totalWidth = document.body.offsetWidth;
    var svgTop = this.bubbleSvgWrapper.offsetTop;

    var bubbleLeft = Math.min(totalWidth - bubbleWidth, x - (bubbleWidth / 2))

    this.bubbleLocationIndicator.style.left = (x - bubbleLeft) + 'px';
    // 2 for 2px in border
    bubble.style.height = bubbleHeight + 2 + 'px';
    bubble.style.left = bubbleLeft + 'px';
    bubble.style.top = (svgTop - bubbleHeight - 10) + 'px';

    this.bubbleTextWrapperController.startTransition();

    bubble.classList.add('initialized');
    bubble.classList.add('show');
    if (this.cursorInitiatedBubbleChange) {
        this.cursorInitiatedBubbleChange = false;
        bubble.classList.add('cursorInitiated');
    } else {
        bubble.classList.remove('cursorInitiated');
    }

    this.bubbleIndexInArticle = bubbleIndexInArticle;

}

/**
 * Closes the bubble when the user clicks somewhere other than the bubble or the
 * context bar, or when the user resizes the screen
 * @private
 * @param {UIEvent} event 
 * @listens UIEvent
 */
Context.prototype.closeBubbleListener = function(event) {
    var bubble = this.bubble;

    if (event.type === 'resize') {
        // prevent incorrect body width after phone rotation
        bubble.style.left = '-9999px';

        this.bubbleWidth = null;

        this.closeBubble();

        // svg does have height 
    } else if (!(bubble.contains(event.target) || event.target.parentNode.height)) {
        this.closeBubble();
    }
}

/**
 * Closes the bubble
 * @private
 */
Context.prototype.closeBubble = function() {
    var bubble = this.bubble;
    // i actually cannot reset other style elements here, as 
    // it will ruin the animation. I can set a listener, but 
    // i think it's a overkill
    bubble.classList.remove('show');

    this.bubbleArticleId = null;
    this.bubbleSvgWrapper = null;
    this.bubbleIndexInArticle = null;
    this.prevRange = [null, null];
    this.turnPageMethod = 0;
    this.hitArticleEnd = 0;
}

/**
 * Moves the context when the user clicks any of four control buttons in the
 * context bubble
 * @private
 * @param {UIEvent} event
 * @listens UIEvent 
 */
Context.prototype.controlListener = function(event) {
    if (!touchEndEventInBound(event))
        return;
    if (this.cursor) {
        attr(this.cursor, 'class', 'cursor');
        this.cursor = null;
    }

    var type = event.currentTarget.classList.contains('bottom') ? 'nextTerm' : 'nextPage';

    var direction = event.currentTarget.classList.contains('right') ? 1 : -1;

    var newBubbleIndexInArticle;

    if (type === 'nextTerm') {
        var termIndices = this.data[this.bubbleArticleId]['termIndices'];
        var prevRange = this.prevRange;

        var indexInArticleOfInterest = prevRange[(direction + 1) >> 1];

        var newIndex = this.findCloestTermIndex(this.bubbleArticleId, indexInArticleOfInterest);

        if ((indexInArticleOfInterest > termIndices[newIndex]) ^ (direction === -1)) {
            newIndex += direction;
        }

        if (newIndex < 0) {
            newIndex = termIndices.length - 1;
            direction = 0;
        } else if (newIndex >= termIndices.length) {
            newIndex = 0;
            direction = 0;
        }
        newBubbleIndexInArticle = termIndices[newIndex];
    } else {
        // if we reach the end of an article, start from the beginning
        if (this.hitArticleEnd === direction) {
            newBubbleIndexInArticle = (this.data[this.bubbleArticleId]['articleLength'] - 1) * (direction === -1);
            direction = 0;
        }
    }

    this.getContext(null, newBubbleIndexInArticle, direction);

}

/**
 * Finds the index of the cloest term. Note: this index refers to the index in
 * the array of all terms, rather than the index in an article.
 * @private
 * @param {number} articleId 
 * @param {number} indexInArticle 
 * @returns {number} 
 */
Context.prototype.findCloestTermIndex = function(articleId, indexInArticle) {
    var termIndices = this.data[articleId]['termIndices']
      , st = 0
      , fi = termIndices.length;
    var k, cloest;
    while (fi - st > 1) {
        k = (fi + st) >> 1;
        if (termIndices[k] > indexInArticle)
            fi = k;
        else
            st = k;
    }
    if (termIndices[st + 1] === undefined) {
        cloest = st;
    } else {
        cloest = Math.abs(indexInArticle - termIndices[st]) > Math.abs(indexInArticle - termIndices[st + 1]) ? st + 1 : st;
    }
    return cloest;
}

/**
 * Process the search result and term display options and stores it for later
 * use
 * @public
 * @param {[number, number[], resultDetails][]} data searchResult from `searcher.search`
 * @param {boolean[]} hiddenWords signals whether each term should get
 * displayed or not
 */
Context.prototype.feedData = function(data, hiddenWords) {
    this.closeBubble();

    var storage = {}
    var fullWidthArticleLength = searcher.getArticleLength95();
    data.forEach(function(article) {
        var flattened = [].concat.apply([], article[2]['searchTermIndex'].filter(function(_, idx) {
            return !hiddenWords[idx];
        }));
        flattened.sort(function(a, b) {
            return a - b;
        });
        storage[article[0]] = {
            plotWidthPercent: Math.min(1, article[2]['articleLength'] / fullWidthArticleLength),
            articleLength: article[2]['articleLength'],
            termIndices: flattened
        };
    });
    storage['hiddenWords'] = hiddenWords;
    this.data = storage;
}
