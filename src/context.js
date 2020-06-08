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
    this.bubbleArticleIndex = null;
    this.cursorInitiatedBubbleChange = false;
    this.prevRange = [null, null];
    this.turnPageMethod = 0;
    this.hitArticleEnd = 0;

    this.prevX = null;
    this.cursor = null;
    this.cursorSvgWrapper = null;
    this.cursorArticleId = null;
    this.cursorInitiatedArticleChangeHandled = false;
    this.cursorArticleIndex = null;
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

Context.prototype.generateControl = function(parent) {
    var bubble = this.bubble;
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

Context.prototype.enter = function(event) {
    if (this.cursor) {
        attr(this.cursor, 'class', 'cursor');
    }
    var svg = event.currentTarget.parentNode;
    this.cursorSvgWrapper = svg.parentNode;
    this.cursor = svg.getElementById('cursor');
    this.cursorArticleId = parseInt(svg.parentNode.parentNode.parentNode.dataset.id);
    this.cursorArticleIndex = null;
    attr(this.cursor, 'class', 'cursor show');
    this.move(event);
}

Context.prototype.move = function(event) {
    if (!this.cursor)
        return;
    // since x's are discrete laptop or phone, let's just reduce the amount of updates;

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

        var cursorArticleIndex = Math.round(percentInSvg / plotWidthPercent * articleLength);

        var cloestTermIndex = this.findCloestTermIndex(cursorArticleId, cursorArticleIndex);
        var cloestBarArticleIndex = currentArticle['termIndices'][cloestTermIndex];
        var cloestBarInSvg = cloestBarArticleIndex / articleLength * plotWidthPercent;

        if (Math.abs(x - div.offsetLeft - cloestBarInSvg * div.offsetWidth) < snapEpsilon) {
            percentInSvg = cloestBarInSvg;
            cursorArticleIndex = cloestBarArticleIndex;
        }

        if (this.cursorArticleIndex !== cursorArticleIndex) {
            // cursor position has been changed, remove waiting context display call
            clearTimeout(this.timeout);
            this.cursorInitiatedArticleChangeHandled = false;

            this.cursorArticleIndex = cursorArticleIndex;
            //             this.cloestTermIndex = cloestTermIndex;

            var percentInSvgText = (percentInSvg * 100).toFixed(2) + '%';
            attr(this.cursor, 'x1', percentInSvgText);
            attr(this.cursor, 'x2', percentInSvgText);

            this.createContextTimeout(cursorArticleId, cursorArticleIndex, this.SHOWBUBBLEWAITTIME);
        }
    }
}

Context.prototype.createContextTimeout = function(cursorArticleId, cursorArticleIndex, time) {
    var self = this;
    this.timeout = setTimeout(function() {
        if (self.cursorArticleId === cursorArticleId && self.cursorArticleIndex === cursorArticleIndex && !self.cursorInitiatedArticleChangeHandled) {
            self.getContext(cursorArticleId, cursorArticleIndex, 0, true);
        }
    }, time);
}

Context.prototype.clickListener = function(event) {
    this.createContextTimeout(this.cursorArticleId, this.cursorArticleIndex, 0);
}

Context.prototype.getContext = function(articleId, middleIndex, overlapDirection, cursorInitiated) {
    middleIndex = typeof middleIndex === 'number' ? middleIndex : this.bubbleArticleIndex;
    articleId = typeof articleId === 'number' ? articleId : this.bubbleArticleId;
    overlapDirection = overlapDirection || 0;

    // cursor has initiated an article change
    if (this.bubbleArticleId !== articleId) {
        this.bubbleArticleId = articleId;
        this.bubbleArticleIndex = null;
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

    var bubbleArticleIndex = (this.prevRange[0] + this.prevRange[1]) >> 1;
    var percentInSvg = bubbleArticleIndex / this.data[this.bubbleArticleId]['articleLength'] * this.data[this.bubbleArticleId]['plotWidthPercent'];
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

    this.bubbleArticleIndex = bubbleArticleIndex;

}

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

Context.prototype.closeBubble = function() {
    var bubble = this.bubble;
    // i actually cannot reset other style elements here, as 
    // it will ruin the animation. I can set a listener, but 
    // i think it's a overkill
    bubble.classList.remove('show');

    this.bubbleArticleId = null;
    this.bubbleSvgWrapper = null;
    this.bubbleArticleIndex = null;
    this.prevRange = [null, null];
    this.turnPageMethod = 0;
    this.hitArticleEnd = 0;
}

Context.prototype.controlListener = function(event) {
    if (!touchEndEventInBound(event))
        return;
    if (this.cursor) {
        attr(this.cursor, 'class', 'cursor');
        this.cursor = null;
    }

    var type = event.currentTarget.classList.contains('bottom') ? 'nextTerm' : 'nextPage';

    var direction = event.currentTarget.classList.contains('right') ? 1 : -1;

    var newBubbleArticleIndex;

    if (type === 'nextTerm') {
        var termIndices = this.data[this.bubbleArticleId]['termIndices'];
        var prevRange = this.prevRange;

        var articleIndexOfInterest = prevRange[(direction + 1) >> 1];

        var newIndex = this.findCloestTermIndex(this.bubbleArticleId, articleIndexOfInterest);

        if ((articleIndexOfInterest > termIndices[newIndex]) ^ (direction === -1)) {
            newIndex += direction;
        }

        if (newIndex < 0) {
            newIndex = termIndices.length - 1;
            direction = 0;
        } else if (newIndex >= termIndices.length) {
            newIndex = 0;
            direction = 0;
        }
        newBubbleArticleIndex = termIndices[newIndex];
    } else {
        // if we reach the end of an article, start from the beginning
        if (this.hitArticleEnd === direction) {
            newBubbleArticleIndex = (this.data[this.bubbleArticleId]['articleLength'] - 1) * (direction === -1);
            direction = 0;
        }
    }

    this.getContext(null, newBubbleArticleIndex, direction);

}

Context.prototype.findCloestTermIndex = function(articleId, articleIndex) {
    var dataArr = this.data[articleId]['termIndices']
      , st = 0
      , fi = dataArr.length;
    var k, cloest;
    while (fi - st > 1) {
        k = (fi + st) >> 1;
        if (dataArr[k] > articleIndex)
            fi = k;
        else
            st = k;
    }
    if (dataArr[st + 1] === undefined) {
        cloest = st;
    } else {
        cloest = Math.abs(articleIndex - dataArr[st]) > Math.abs(articleIndex - dataArr[st + 1]) ? st + 1 : st;
    }
    return cloest;
}

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
