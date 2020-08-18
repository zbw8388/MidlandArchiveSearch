/**
 * Mangaes `contextTextWrapper`, which displays the context text element and
 * also provides animations including the the page turning effect and the fade
 * in/out effect.
 *
 * When there are many buffered pages, it looks like a train to me, and hence
 * the name
 * @constructor
 * @param {HTMLElement} parent 
 * @param {number} childrenWidth determines the width of the context, which will
 * change when the window resizes
 */
function ContextTextTrain(parent, childrenWidth) {
    this.index = -1;
    this.childrenWidth = childrenWidth;

    this.parent = parent;

    this.train = el('div', parent, 'contextTextWrapper');
    this.train.addEventListener('transitionend', this.transitionEnd.bind(this));
    
    this.items = []
    this.pendingTransition = [];

    this.pendingTransition.push([this.train, 'opacity', 1]);

}

/**
 * @public
 * @param {number} newWidth 
 */
ContextTextTrain.prototype.setChildrenWidth = function(newWidth) {
    // i don't think this matters other than initialization since the this element will get destroyed
    // after the bubble reappears
    this.items.forEach(function(item) {
        item[0].style.width = newWidth + 'px';
    });
    this.childrenWidth = newWidth;
}

/**
 * Updates the context text the user sees
 * @public
 * @param {number} direction the direction of movement. If 0, then destroys the
 * current train and creates a new one, resulting in the fade in/out effect.
 * Otherwiser, results in a page turning effect
 * @param {[?HTMLElement, [number, number]]} item a tuple. The first element is
 * the optional new context element, and the second one is the range associated
 * with the former element
 * @param {boolean} [animate=false] signifies if the destruction requires
 * animation or not. When the bubble is closed, the user will not expect the
 * fadeout of the previous result
 */
ContextTextTrain.prototype.movePage = function(direction, item, animate) {
    var newText = item[0];
    var newIndex = this.index + direction;

    if (!direction) {
        return this.destruct(item, animate);
    }

    if (newText) {

        newText.style.width = this.childrenWidth + 'px';
        if (direction > 0) {
            this.train.appendChild(newText);
            this.items.push(item);
        } else {
            this.train.insertBefore(newText, this.train.firstChild);
            this.train.style.transition = 'none';
            // 1px for border
            this.train.style.left = (1 + this.parent.getBoundingClientRect().left - this.train.getBoundingClientRect().left - this.childrenWidth) + 'px';
            // make sure that it teleports before moving
            this.train.offsetWidth;

            this.pendingTransition.push([this.train, 'transition', '']);

            this.items.unshift(item);
            newIndex++;
        }
    }

    this.pendingTransition.push([this.train, 'left', -1 * newIndex * this.childrenWidth + 'px']);
    this.index = newIndex;

    return this;
}

/**
 * Starts all pending transitions. Created to reduce the number of forced
 * reflows.
 * @public
 */
ContextTextTrain.prototype.startTransition = function() {
    var transition;
    while (transition = this.pendingTransition.shift()) {
        transition[0].style[transition[1]] = transition[2];
    }
}

/**
 * Cleans up the train if it's too long after a transition to save the memory
 * @private
 * @param {TransitionEvent} event 
 * @listens TransitionEvent
 */
ContextTextTrain.prototype.transitionEnd = function(event) {
    if (event.propertyName === 'left') {
        // clean up the "train" if it's too long
        if (this.items.length >= 8) {
            for (var i = this.items.length - 1; i >= 0; i--) {
                if (Math.abs(i - this.index) <= 2) {
                    continue;
                }
                var child = this.items.splice(i, 1)[0][0];
                this.train.removeChild(child);
                if (i < this.index) {
                    this.index--;
                }
            }
            this.train.style.transition = 'none';
            this.train.style.left = -1 * this.index * this.childrenWidth + 'px';
            this.train.offsetWidth;
            this.train.style.transition = '';
        }
    }
}

/**
 * Returns the current displaying text and its displaying range in the article
 * @public
 * @returns {[HTMLElement, [number, number]]} 
 */
ContextTextTrain.prototype.getCurrentItem = function() {
    return this.items[this.index];
}

/**
 * Checks if the current train or buffer contains the requested page
 * @public
 * @param {number} direction If 0, then defaults to false as it doesn't want any
 * transition
 */
ContextTextTrain.prototype.pageExist = function(direction) {
    var newIndex = this.index + direction;
    return direction && 0 <= newIndex && newIndex < this.items.length;
}

/**
 * Removes the current wrapper and create a new one, resulting in a fade in/out effect
 * @private
 * @param {[?HTMLElement, [number, number]]} item see item in `movePage`. The
 * new item to display
 * @param {boolean} animate see animate in `movePage`
 */
ContextTextTrain.prototype.destruct = function(item, animate) {
    if (!animate || !this.train.children.length) {
        this.remove();
    } else {
        this.train.classList.add('retire');
        this.train.addEventListener('transitionend', this.remove.bind(this));
    }
    var newWrapper = new ContextTextTrain(this.parent,this.childrenWidth);
    newWrapper.movePage(1, item);
    return newWrapper;
}

/**
 * Removes the wrapper from DOM upon calling or at a transition event. After
 * this point, it should not be reachable
 * @param {TransitionEvent=} event
 * @listens TransitionEvent
 */
ContextTextTrain.prototype.remove = function(event) {
    if (!event || event.propertyName === 'opacity') {
        this.train.parentNode.removeChild(this.train);
    }
}
