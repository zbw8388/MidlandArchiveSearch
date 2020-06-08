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

// i don't think this matters other than initialization since the this element will get destroyed
// after the bubble reappear
ContextTextTrain.prototype.setChildrenWidth = function(newWidth) {
    this.items.forEach(function(item) {
        item[0].style.width = newWidth + 'px';
    });
    this.childrenWidth = newWidth;
}

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

ContextTextTrain.prototype.startTransition = function() {
    var transition;
    while (transition = this.pendingTransition.shift()) {
        transition[0].style[transition[1]] = transition[2];
    }
}

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

ContextTextTrain.prototype.getCurrentItem = function() {
    return this.items[this.index];
}

ContextTextTrain.prototype.pageExist = function(direction) {
    var newIndex = this.index + direction;
    return direction && 0 <= newIndex && newIndex < this.items.length;
}

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

ContextTextTrain.prototype.remove = function(event) {
    if (!event || event.propertyName === 'opacity') {
        this.train.parentNode.removeChild(this.train);
    }
}
