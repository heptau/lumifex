// https://github.com/jorgejeferson/translate.js/tree/39be8237666a76035fc210a28d8e431f1416579e
(function ($) {
	//translations may contain simple inline markup; everything else (scripts, event handlers...) is dropped
	const ALLOWED_TAGS = ['B', 'I', 'U', 'EM', 'STRONG', 'SPAN', 'SMALL', 'BR', 'CODE', 'SUB', 'SUP', 'A'];
	const ALLOWED_ATTRS = ['class', 'title', 'href', 'target', 'rel'];

	const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'};

	function decode_entities(text) {
		return text.replace(/&(#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]{2,5});/gi, (match, name) => {
			if (name[0] === '#') {
				const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
				return code > 0 && code < 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
			}
			return Object.prototype.hasOwnProperty.call(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : match;
		});
	}

	//copies the allowed attributes of a tag (`attributes` is the text between the tag name and ">")
	function copy_attributes(element, attributes) {
		const pattern = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
		let match;
		while ((match = pattern.exec(attributes)) !== null) {
			const name = match[1].toLowerCase();
			const value = decode_entities(match[2] !== undefined ? match[2] : match[3]);
			if (ALLOWED_ATTRS.indexOf(name) < 0) {
				continue;
			}
			if (name === 'href' && /^(https?:|mailto:|#)/i.test(value.trim()) === false) {
				continue;
			}
			element.setAttribute(name, value);
		}
	}

	//sets the content of the element from a text with simple markup. The text is never parsed as HTML:
	//only the allowed tags are recognized and built with the DOM API, everything else stays plain text
	function set_safe_content($element, text) {
		const root = document.createDocumentFragment();
		const stack = [root];
		const open_tags = [];
		const tag = /<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gi;
		const source = String(text);
		let last = 0;
		let match;
		const add_text = (chunk) => {
			if (chunk !== '') {
				stack[stack.length - 1].appendChild(document.createTextNode(decode_entities(chunk)));
			}
		};
		while ((match = tag.exec(source)) !== null) {
			add_text(source.slice(last, match.index));
			last = tag.lastIndex;
			const name = match[2].toUpperCase();
			if (ALLOWED_TAGS.indexOf(name) < 0) {
				//unknown element: its tags are dropped, the content is kept
				continue;
			}
			if (match[1] === '/') {
				const index = open_tags.lastIndexOf(name);
				if (index >= 0) {
					open_tags.length = index;
					stack.length = index + 1;
				}
				continue;
			}
			const element = document.createElement(name);
			copy_attributes(element, match[3]);
			stack[stack.length - 1].appendChild(element);
			if (name !== 'BR' && match[4] !== '/') {
				open_tags.push(name);
				stack.push(element);
			}
		}
		add_text(source.slice(last));
		$element.empty().append(root);
	}

	$.fn.translate = function (options) {
		const that = this; //a reference to ourselves
		let settings = {
			css: "trn",
			attrs: ["alt", "placeholder", "title"],
			lang: "pt",
			langDefault: "pt",
		};
		settings = $.extend(settings, options || {});
		if (settings.css.lastIndexOf(".", 0) !== 0) { //doesn't start with '.'
			settings.css = `.${  settings.css}`;
		}
		const t = settings.t;
		//public methods
		this.lang = function (l) {
			if (l) {
				settings.lang = l;
				this.translate(settings);  //translate everything
			}
			return settings.lang;
		};
		this.get = function (index) {
			let res;

			try {
				res = t[index][settings.lang];
			}
			catch { //not found, return index
				return index;
			}
			if (res) {
				return res;
			}
			else {
				return index;
			}
		};
		this.g = this.get;
		//main
		this.find(settings.css).each(function () {
			const $this = $(this);

			//elements with an icon (svg) keep their content, only the attributes (title) are translated
			const has_icon = $this.find("svg").length > 0;
			let trn_key = $this.attr("data-trn-key");
			if (!trn_key && !has_icon) {
				trn_key = $this.html();
				$this.attr("data-trn-key", trn_key);
			}
			// Filtering attr
			$.each(this.attributes, function () {
				if ($.inArray(this.name, settings.attrs) !== -1) {
					let trn_attr_key = $this.attr("data-trn-attr");
					if (!trn_attr_key) {
						trn_attr_key = $this.attr(this.name);
						$this.attr("data-trn-attr", trn_attr_key);
					}
					$this.attr(this.name, that.get(trn_attr_key));
				}
			});
			if (!has_icon) {
				set_safe_content($this, that.get(trn_key));
			}
		});
		return this;
	};
})(jQuery);
