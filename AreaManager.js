define(["dojo/_base/kernel",
	"dojo/_base/declare",
	"dojo/_base/connect",
	"dojo/_base/window",
	"dojo/_base/array",
	"dojo/_base/sniff",
	"dojo/_base/lang",
	"dojo/query",
	"dojo/topic", // topic.publish()
	"dojo/dom",
	"dojo/dom-class",
	"dojo/dom-geometry",
	"dojo/dom-construct",
	"dojo/dom-style",
	"dijit/registry",
	"dijit/_Widget",
	"./Moveable"
],function(dojo, declare, connect, win, array, sniff, lang, query, topic, dom, domClass, geom, 
	domConstruct, domStyle, registry, _Widget, Moveable){
	var am = declare(
		"smdnd.AreaManager",
		null,
	{
		// summary:
		//		Drag And Drop manager
	
		// autoRefresh: Boolean
		//		Enable the refresh of registered areas on drag start.
		autoRefresh: true,
	
	
		// areaClass: String
		//		CSS class enabled an area if areaClass is defined
		areaClass: "dojoxDndArea",
	
		// dragHandleClass: String
		//		CSS class enabled a drag handle.
		dragHandleClass: "dojoxDragHandle",

		// _currentIndexArea : Object
		//		Closest area to current drag point (regardless of acceptance criteria)
		
		// _currentDropIndex : integer
		//		Index of item in area where item will be dropped (is closest acceptable area).
		//		dropIndicator is placed in this area.

	
		constructor: function(){
			// summary:
			//		Constructor of AreaManager class.
			//		Initialize arrays, connects and subscribes.
	
			//console.log("smdnd.AreaManager ::: constructor");
			this._areaList = [];
			this.resizeHandler = connect.connect(dojo.global,"onresize", this, function(){
				this._dropMode.updateAreas(this._areaList);
			});
			
			this._oldIndexArea = this._currentIndexArea = this._oldDropIndex = this._currentDropIndex = this._sourceIndexArea = this._sourceDropIndex = -1;
		},
	
		init: function(){
			// summary:
			//		Initialize the manager by calling the registerByClass method
	
			//console.log("smdnd.AreaManager ::: init");
			this.registerByClass();
		},
	
		registerByNode: function(/*DOMNode*/area, /*Boolean*/notInitAreas){
			// summary:
			//		To register Dnd Area : insert the DndArea using the specific sort of dropMode.
			// area:
			//		a DOM node corresponding to the Dnd Area
			// notInitAreas:
			//		if false or undefined, init the areas.
	
			//console.log("smdnd.AreaManager ::: registerByNode", area);
			var index = this._getIndexArea(area);
			if(area && index == -1){
				var acceptType = area.getAttribute("accept");
				var accept = (acceptType) ? acceptType.split(/\s*,\s*/) : ["text"];
				var obj = {
					'node': area,
					'items': [],
					'coords': {},
					'margin': null,
					'accept': accept,
					'initItems': false
				};
				array.forEach(this._getChildren(area), function(item){
					this._setMarginArea(obj, item);
					obj.items.push(this._addMoveableItem(item));
				}, this);
				this._areaList = this._dropMode.addArea(this._areaList, obj);
				if(!notInitAreas){
					this._dropMode.updateAreas(this._areaList);
				}
				connect.publish("/dojox/mdnd/manager/register",[area]);
			}
		},
	
		registerByClass: function(){
			// summary:
			//		Register all Dnd Areas identified by the attribute areaClass :
			//		insert Dnd Areas using the specific sort of dropMode.
	
			//console.log("smdnd.AreaManager ::: registerByClass");
			query('.'+this.areaClass).forEach(function(area){
				this.registerByNode(area, true);
			}, this);
			this._dropMode.updateAreas(this._areaList);
		},
	
		unregister: function(/*DOMNode*/area){
			// summary:
			//		Unregister a D&D Area and its children into the AreaManager.
			// area:
			//		A node corresponding to the D&D Area.
			// returns:
			//		True if the area is found and unregistered.
	
			//console.log("smdnd.AreaManager ::: unregister");
			var index = this._getIndexArea(area);
			if(index != -1){
				array.forEach(this._areaList[index].items, function(item){
					this._deleteMoveableItem(item);
				}, this);
				this._areaList.splice(index,1);
				// refresh target area
				this._dropMode.updateAreas(this._areaList);
				return true; // Boolean
			}
			return false; // Boolean
		},
	
		_addMoveableItem: function(/*DOMNode*/node){
			// summary:
			//		Create a draggable item with a DOM node.
			// node:
			//		A child of the D&D Area.
			// returns:
			//		The draggable item.
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _addMoveableItem");
			node.setAttribute("tabIndex", "0");
			var handle = this._searchDragHandle(node);
			var moveable = new Moveable({ 'handle': handle, 'skip': true }, node);
			// add a css style :
			domClass.add(handle || node, "dragHandle");
			var type = node.getAttribute("dndType");
			var item = {
				'item': moveable,
				'type': type ? type.split(/\s*,\s*/) : ["text"],
				'handlers': [connect.connect(moveable, "onDragStart", this, "onDragStart")],
			}
			if (domClass.contains(node,'dndArea')){
				item.isArea = true;
				var indexArea = this._getIndexArea(node);
				if (indexArea && indexArea > -1)
					item.areaIndex = indexArea;	
			}
			
			// connect to the uninitialize method of dijit._Widget to delete a moveable before a destruct
			if(registry && registry.byNode){
				var widget = registry.byNode(node);
				if(widget){
					item.type = widget.dndType ? widget.dndType.split(/\s*,\s*/) : ["text"];
					item.handlers.push(
						connect.connect(widget, "uninitialize", this, function(){
							this.removeDragItem(node.parentNode, moveable.node);
						})
					);
				}
			}
			return item; // Object
		},
	
		_deleteMoveableItem: function(/*Object*/ objItem){
			// summary:
			//		Delete the Moveable object associated with a node.
			// item:
			//		A moveable Object.
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _deleteMoveableItem", objItem);
			// disconnect the handle
			array.forEach(objItem.handlers, function(handler){
				connect.disconnect(handler);
			});
			// delete css style :
			var node = objItem.item.node,
				handle = this._searchDragHandle(node);
			domClass.remove(handle || node, "dragHandle");
			// call destroy of Moveable class
			objItem.item.destroy();
		},
	
		_getIndexArea: function(/*DOMNode*/area){
			// summary:
			//		Get the index of an area.
			// area:
			//		A moveable Object.
			// returns:
			//		area index or -1
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _getIndexArea");
			if(area){
				for(var i = 0; i < this._areaList.length; i++){
					if(this._areaList[i].node === area){
						return i;	// Integer
					}
				}
			}
			return -1;	// Integer
		},
	
		_searchDragHandle: function(/*DOMNode*/node){
			// summary:
			//		Return the node which contains the first specific CSS class handle.
			// node:
			//		A child of the D&D Area.
			// returns:
			//		The drag handle node.
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _searchDragHandle");
			if(node){
				var cssArray = this.dragHandleClass.split(' '),
					length = cssArray.length,
					queryCss = "";
				array.forEach(cssArray, function(css, i){
					queryCss += "." + css;
					if(i != length - 1){
						queryCss += ", ";
					}
				});
				return query(queryCss, node)[0]; // DomNode
			}
		},
	
		addDragItem: function(/*DOMNode*/area, /*DOMNode*/node, /*Integer*/index, /*Boolean*/notCheckParent){
			// summary:
			//		To add an item programmatically.
			// area:
			//		a node corresponding to the D&D Area
			// node:
			//		the node which has to be treated.
			// index:
			//		the place in the area
			// noCheckParent:
			//		if true, doesn't check if node has a parent.
			// returns:
			//		True if the node has been inserted else false.
	
			//console.log("smdnd.AreaManager ::: addDragItem");
			var add = true;
			if(!notCheckParent){
				add = area && node && (node.parentNode === null || (node.parentNode && node.parentNode.nodeType !== 1));
			}
			if(add){
				var indexArea = this._getIndexArea(area);
				if(indexArea !== -1){
					var item = this._addMoveableItem(node),
						items = this._areaList[indexArea].items;
					if(0 <= index && index < items.length){
						var firstListChild = items.slice(0, index),
							lastListChild = items.slice(index, items.length);
						firstListChild[firstListChild.length] = item;
						this._areaList[indexArea].items = firstListChild.concat(lastListChild);
						area.insertBefore(node, items[index].item.node);
					}
					else{
						this._areaList[indexArea].items.push(item);
						area.appendChild(node);
					}
					this._setMarginArea(this._areaList[indexArea], node);
					this._areaList[indexArea].initItems = false;
					return true;	// Boolean
				}
			}
			return false;	// Boolean
		},
	
		removeDragItem: function(/*DOMNode*/area, /*DOMNode*/node){
			// summary:
			//		Delete a moveable item programmatically. The node is removed from the area.
			// area:
			//		A node corresponding to the DndArea.
			// node:
			//		The node which has to be treated.
			// returns:
			//		the removed node
	
			//console.log("smdnd.AreaManager ::: removeDragItem");
			var index = this._getIndexArea(area);
			if(area && index !== -1){
				var items = this._areaList[index].items;
				for(var j = 0; j < items.length; j++){
					if(items[j].item.node === node){
						this._deleteMoveableItem(items[j]);
						// delete item of the array
						items.splice(j, 1);
						return area.removeChild(node); // Object
					}
				}
			}
			return null;
		},
	
		_getChildren: function(/*DOMNode*/area){
			// summary:
			//		Get the children of a D&D area.
			// area:
			//		A DnD area.
			// returns:
			//		The children of a DnD area
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _getChildren");
			var children = [];
			array.forEach(area.childNodes, function(child){
				// delete \n
				if(child.nodeType == 1){
					if(registry && registry.byNode){
						var widget = registry.byNode(child);
						if(widget){
							if(!widget.dragRestriction){
								children.push(child);
							}
						}
						else{
							children.push(child);
						}
					}
					else{
						children.push(child);
					}
				}
			});
			return children;	//Array
		},
	
		_setMarginArea: function(/*Object*/area,/*DOMNode*/node){
			// summary:
			//		Set the value of margin in the data type of areaManager
			//		only when the margin has never been computed.
			// area:
			//		The object of a D&D Area.
			// node:
			//		The node which contains margins
			// tags:
			//		protected
	
			//console.log("smdnd.AreaManager ::: _setMarginArea");
			if(area && area.margin === null && node){
				area.margin = geom.getMarginExtents(node);
			}
		},

		getTargetArea: function(/*Array*/areaList, /*Object*/ coords, /*integer*/currentIndexArea,
						/*Integer*/excludeIndexArea ){
			// summary:
			//		Helper for dropModes getTargetArea method to allow excluding an area. By 
			//		default, if the dragItem is an area, it will ask dropMode to ignore it 
			//		when searching for target areas.
			//	parems:
			//		areaList:
			//			see dropMode.getTargetArea
			//		coords:
			//			see dropMode.getTargetArea
			//		currentIndexArea:
			//			see dropMode.getTargetArea
			//		excludeIndexArea:
			//			area index of excluded area or -1 to not exclude.

			if (this._dragItem.isArea && !(this._dragItem.areaIndex >= 0)){
				var index = this._getIndexArea(this._dragItem.item.node);
				this._dragItem.areaIndex = index;
			}

			var excludeIndexArea = this._dragItem.areaIndex >= 0 ? this._dragItem.areaIndex  : -1;
			return this._dropMode.getTargetArea(areaList,coords,currentIndexArea,excludeIndexArea);

		},
	
		findCurrentIndexArea: function(/*Object*/coords, /*Object*/size){
			// summary:
			//		Set the nearest target area to CurrentIndexArea according to coordinates
			//		 and process onDragEnter/Exit events on areas when it changes. 
			//		Coordinates are representing by an object : for example, {'x':10,'y':10}
			// coords:
			//		an object encapsulating X and Y position
			// size:
			//		an object encapsulating the area size
			// returns:
			//		an index of area
	
			//console.log("smdnd.AreaManager ::: findCurrentIndexArea");
			this._oldIndexArea = this._currentIndexArea;
//			this._currentIndexArea = this._dropMode.getTargetArea(this._areaList, coords, this._currentIndexArea);
			this._currentIndexArea = this.getTargetArea(this._areaList, coords, this._currentIndexArea);
			if(this._currentIndexArea != this._oldIndexArea){
				if(this._oldIndexArea != -1){
					this.onDragExit(coords, size);
				}
				if(this._currentIndexArea != -1){
					this.onDragEnter(coords, size);
				}
			}
			return this._currentIndexArea;	//Integer
		},
	
		_isAccepted: function(/*Array*/ type, /*Array*/ accept){
			// summary:
			//		True if user can drop widget on this node.
			// type:
			//		Array containing item type
			// accept:
			//		Array containing types
			this._accept = false;
			for(var i = 0; i < accept.length; ++i){
				for(var j = 0; j < type.length;++j){
					if(type[j] == accept[i]){
						this._accept = true;
						break;
					}
				}
			}
		},
	
		onDragStart: function(/*DOMNode*/node, /*Object*/coords, /*Object*/size){
			// summary:
			//		Initialize the drag (see smdnd.Moveable.initOffsetDrag())
			// node:
			//		The node which is about to be dragged
			// coords:
			//		an object encapsulating X and Y position
			// size:
			//		an object encapsulating width and height values
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDragStart");
			if(this.autoRefresh){
				this._dropMode.updateAreas(this._areaList);
			}
	
			// Create the cover :
			var _html = (sniff("webkit")) ? dojo.body() : dojo.body().parentNode;
			if(!this._cover){
				this._cover = domConstruct.create('div', {
					'class': "dndCover"
				});
				this._cover2 = lang.clone(this._cover);
				domClass.add(this._cover2, "dndCover2");
			}
			var h = _html.scrollHeight+"px";
			this._cover.style.height = this._cover2.style.height = h;
			dojo.body().appendChild(this._cover);
			dojo.body().appendChild(this._cover2);
	
			this._dragStartHandler = connect.connect(node.ownerDocument, "ondragstart", dojo, "stopEvent");
			// to know the source
			this._sourceIndexArea = this._lastValidIndexArea = this._currentIndexArea = this._getIndexArea(node.parentNode);
			// delete the dragItem into the source area
			var sourceArea = this._areaList[this._sourceIndexArea];
			var children = sourceArea.items;
			for(var i = 0; i < children.length; i++){
				if(children[i].item.node == node){
					this._dragItem = children[i];
					this._dragItem.handlers.push(connect.connect(this._dragItem.item, "onDrag", this, "onDrag"));
					this._dragItem.handlers.push(connect.connect(this._dragItem.item, "onDragEnd", this, "onDrop"));
					children.splice(i,1);
					this._currentDropIndex = this._sourceDropIndex = i;
					break;
				}
			}

			var nodeRef = null;
			if(this._sourceDropIndex !== sourceArea.items.length){
				nodeRef = sourceArea.items[this._sourceDropIndex].item.node;
			}
			// IE7 OPTIMIZATION
			if(sniff("ie")> 7){
				// connect these events on the cover
				this._eventsIE7 = [
					connect.connect(this._cover, "onmouseover", dojo, "stopEvent"),
					connect.connect(this._cover, "onmouseout", dojo, "stopEvent"),
					connect.connect(this._cover, "onmouseenter", dojo, "stopEvent"),
					connect.connect(this._cover, "onmouseleave", dojo, "stopEvent")
				];
			}
	
			this._recordStartDimensionText(node);

			var s = node.style;
			s.left = coords.x+"px";
			s.top = coords.y+"px";



//			s.width = "auto";
			if (!/(^|\s)\s*width\s*:/.test(s.cssText))
					s.width = "auto";
			// attach the node to the cover
			if(s.position == "relative" || s.position == ""){
				s.position = "absolute"; // enforcing the absolute mode
			}
			
			this._cover.appendChild(node);
			this._placeSourceAnchor(sourceArea.node,nodeRef,size);
			this._dropIndicator.place(sourceArea.node, nodeRef, size);
			
			// add a style to place the _dragNode in foreground
			domClass.add(node, "dragNode");
			// A dragged node is always draggable in this source area.
			this._accept = true;
			connect.publish("/dojox/mdnd/drag/start",[node, sourceArea, this._sourceDropIndex]);
		},

		_recordStartDimensionText : function(/*domNode*/node){
			// summary:
			//		Records the inline styles for the node that reference the node 
			//		position and size, if any. This is used for the absolute placement 
			//		algorithm to allow these values to be restored if the dnd is cancelled 
			//		or the node cannot be placed such that the node is returned to its 
			//		origin.
			//	node:
			//		dragged dom node.

			var inline = node.style.cssText;
			var inlineAr = inline && inline.split(/\s*;\s*/);
			var dt;

			
			inlineAr && inlineAr.forEach(function(entry){
				var comps = entry.split(/\s*:\s*/);
				if (comps && comps.length == 2){
					switch(comps[0].toLowerCase()){
						case 'width' : 
						case 'height': 
						case 'left' :
						case 'top':
							dt = dt ? dt : {};
							dt[comps[0]] = comps[1]; break;
						default:
					}
				}
			});
		
			dt && (this._dragNodeDimStyles = dt);


		},

		_placeSourceAnchor: function(/*Node*/area, /*Node*/nodeRef, /*Object*/size){
			// summary:
			//		Place the SourceAnchor in the right place
			//		The sourceAnchor is used to record the original position of the node 
			//		in case the operation is cancelled and node must be returned.
			// area:
			//		the dnd targer area node
			// nodeRef:
			//		node where the dropIndicator have to be placed into the area
			// dragNode:
			//		the node which is dragged
			// returns:
			//		the node inserted or null if it crashes
	
			//console.log("smdnd.DropIndicator ::: place");
			if (this._sourceAnchor){
				this._removeSourceAnchor();
			}
			this._sourceAnchor = domConstruct.toDom("<div id='dndSourceAnchor'></div>");
			if(nodeRef){
				area.insertBefore(this._sourceAnchor, nodeRef);
			}
			else{
				// empty target area or last node => appendChild
				area.appendChild(this._sourceAnchor);
			}
		},	

		_removeSourceAnchor : function(){
			this._sourceAnchor && domConstruct.destroy(this._sourceAnchor);
			this._sourceAnchor = undefined;
		},		
	
		onDragEnter: function(/*Object*/coords, /*Object*/size){
			// summary:
			//		Optionally called by the getTargetArea method of TargetFinder class.
			// coords:
			//		coordinates of the dragged Node.
			// size:
			//		size of the dragged Node.
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDragEnter", coords, size);
			if(this._currentIndexArea === this._sourceIndexArea){
				this._accept = true;
			}
			else{
				this._isAccepted(this._dragItem.type, this._areaList[this._currentIndexArea].accept);
			}
		},
	
		onDragExit: function(/*Object*/coords, /*Object*/size){
			// summary:
			//		Optionally called by the getTargetArea method of TargetFinder class.
			// coords:
			//		coordinates of the dragged Node.
			// size:
			//		size of the dragged Node.
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDragExit");
			this._accept = false;
		},
	
		onDrag: function(/*DOMNode*/node, /*Object*/coords, /*Object*/size, /*Object*/mousePosition){
			// summary:
			//		Occurs when the dojo.dnd.Moveable.onDrag is fired.
			//		Search the nearest target area and called the placeDropIndicator
			// node:
			//		The node which is dragged
			// coords:
			//		an object encapsulating X and Y position
			// size:
			//		an object encapsulating width and height values
			// mousePosition:
			//		coordinates of mouse
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDrag", node, ",", coords,size);
			var coordinates = this._dropMode.getDragPoint(coords, size, mousePosition);
			this.findCurrentIndexArea(coordinates, size);
			if(this._currentIndexArea !== -1 && this._accept){
				this.placeDropIndicator(coordinates, size);
			}
		},
	
		placeDropIndicator: function(/*Object*/coords, /*Object*/size){
			// summary:
			//		Search the right place to insert the dropIndicator and display the dropIndicator.
			// coords:
			//		an object encapsulating X and Y position
			// size:
			//		an object encapsulating width and height values
			// returns:
			//		the current drop index
	
			//console.log("smdnd.AreaManager ::: placeDropIndicator");
			//keep old drop Index
			this._oldDropIndex = this._currentDropIndex;
			// calculate all children marker (see VerticalDropMode.initItems())
			var area = this._areaList[this._currentIndexArea];
			if(!area.initItems){
				this._dropMode.initItems(area);
			}
			//get the index where the drop has to be placed.
			this._currentDropIndex = this._dropMode.getDropIndex(area, coords);
			if(!(this._currentIndexArea === this._oldIndexArea && this._oldDropIndex === this._currentDropIndex)){
				this._placeDropIndicator(size);
			}
			return this._currentDropIndex;	//Integer
		},
	
		_placeDropIndicator: function(/*Object*/size){
			// summary:
			//		place the dropIndicator
			// size:
			//		an object encapsulating width and height values
			// tags:
			//		protected
	
			var oldArea = this._areaList[this._lastValidIndexArea];
			var currentArea = this._areaList[this._currentIndexArea];
			//refresh the previous area after moving out the drop indicator
			this._dropMode.refreshItems(oldArea, this._oldDropIndex, size, false);
			// place dropIndicator
			var node = null;
			if(this._currentDropIndex != -1){
				node = currentArea.items[this._currentDropIndex].item.node;
			}
//			domClass.remove(oldArea.node,"drop-target-area");
//			domClass.add(currentArea.node,"drop-target-area");
			this._dropIndicator.place(currentArea.node, node);
			this._lastValidIndexArea = this._currentIndexArea;
			//refresh the current area after placing the drop indicator
			this._dropMode.refreshItems(currentArea, this._currentDropIndex, size, true);
		},
	
		onDropCancel: function(){
			// summary:
			//		Cancel the drop.
			//		The dragNode returns into the source, or if the dropIndicator node container 
			//		is annotatted with the 'stickyDropArea', it will go ahead and put the 
			//		node in the last dropIndicator area.
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDropCancel");
//			if(!this._accept){
				var parentNode = this._dropIndicator.node.parentNode;
				var index = this._getIndexArea(parentNode);
				var stickyDropArea = (index > -1) && domClass.contains(parentNode,"stickyDropArea");
				if(stickyDropArea && index != -1){
					this._currentIndexArea = index;
				} else {
					var sourceAnchor = dom.byId('dndSourceAnchor')
					this._currentIndexArea = this._getIndexArea(sourceAnchor.parentNode);
					var currentArea = this._areaList[this._currentIndexArea]
//					if (this._sourceDropIndex != currentArea.items.length)
					this._currentDropIndex = this._sourceDropIndex != currentArea.items.length ?
										this._sourceDropIndex :-1;
					var size = this._dragItem.item.size;
					this._placeDropIndicator(size);
				}
//				else{
					// case if the dropIndicator is in the area which has been unregistered during the drag.
					// chose by default the first area.
//					this._currentIndexArea = 0;
//				}
//			}
		},

		_restoreInlineDimensionStyles : function(node){
			// summary:
			//		Restores inline dimension styles that were cached at the beginning of 
			//		the drag operation. See _recordStartDimensionText for more details.
			//	node:
			//		dragged node dom node.

			var is = this._dragNodeDimStyles;
			if (is){
				domStyle.set(node,is);
				this._dragNodeDimStyles = null;
			}

		},
		

	
		onDrop: function(/*DOMNode*/node){
			// summary:
			//		Drop the dragged item where the dropIndicator is displayed.
			// node:
			//		The node which is about to be dropped
			// tags:
			//		callback
	
			//console.log("smdnd.AreaManager ::: onDrop");
			//dropCancel
			var geo = geom.position(node,true),
				cancel = false;

			if (!this._accept || !this._dropMode.canDropHere(this._areaList,this._currentIndexArea,geo.x,geo.y)){
				this.onDropCancel();
				cancel = true;
			}

			var targetArea = this._areaList[this._currentIndexArea];
			domClass.remove(node, "dragNode");
			var style = node.style;
			if (domClass.contains(targetArea.node,'absoluteContainer')){
				// if the container is an 'absoluteContainer', it is going to 
				// place the nodes with position: absolute here.
				var elecoors = geom.position(node,true);
				var parentCoors = geom.position(targetArea.node,true);
				style.position = "absolute";

				if (cancel){
					this._restoreInlineDimensionStyles(node);

				} else {
					var left = elecoors.x - parentCoors.x;
					var top = elecoors.y - parentCoors.y;
					style.left = left + "px";
					style.top = top + "px";
					if (!/(^|\s)\s*width\s*:/.test(node.style.cssText))
						style.width = "auto";	
				}
				
			} else {
				// if the container is not an 'absoluteContainer', nodes are 
				// placed with style relative.
				style.position = "relative";			
				style.left = "0";
				style.top = "0";
				if (!/(^|\s)\s*width\s*:/.test(node.style.cssText))
					style.width = "auto";
			}
			if(targetArea.node == this._dropIndicator.node.parentNode){
				targetArea.node.insertBefore(node, this._dropIndicator.node);
			}
			else{
				// case if the dropIndicator is in the area which has been unregistered during the drag.
				targetArea.node.appendChild(node);
				this._currentDropIndex = targetArea.items.length;
			}
			// add child into the new target area.
			var indexChild = this._currentDropIndex;
			if(indexChild == -1){
				indexChild = targetArea.items.length;
			}
			var children = targetArea.items;
			var firstListArea = children.slice(0, indexChild);
			var lastListArea = children.slice(indexChild, children.length);
			firstListArea[firstListArea.length] = this._dragItem;
			targetArea.items = firstListArea.concat(lastListArea);
	
			this._setMarginArea(targetArea, node);
			array.forEach(this._areaList, function(obj){
				obj.initItems = false;
			});
			// disconnect onDrop handler
			connect.disconnect(this._dragItem.handlers.pop());
			connect.disconnect(this._dragItem.handlers.pop());
			this._resetAfterDrop();
			// remove the cover
			if(this._cover){
				dojo.body().removeChild(this._cover);
				dojo.body().removeChild(this._cover2);
			}
			connect.publish("/dojox/mdnd/drop",[node, targetArea, indexChild]);
		},
	
		_resetAfterDrop: function(){
			// summary:
			//		reset manager properties after dropping an item
			// tags:
			//		protected
	
			this._accept = false;
			this._dragItem = null;
			this._currentDropIndex = -1;
			this._currentIndexArea = -1;
			this._oldDropIndex = -1;
			this._sourceIndexArea = -1;
			this._sourceDropIndex = -1;
			this._dropIndicator.remove();

			this._removeSourceAnchor();
			this._dragNodeDimStyles = null;

			if(this._dragStartHandler){
				connect.disconnect(this._dragStartHandler);
			}
			if(sniff("ie") > 7){
				array.forEach(this._eventsIE7, connect.disconnect);
			}


		},
	
		destroy: function(){
			// summary:
			//		Destroy the component.
	
			//console.log("smdnd.AreaManager ::: destroy");
			//see implementation of unregister()
			while(this._areaList.length > 0){
				if(!this.unregister(this._areaList[0].node)){
					throw new Error("Error while destroying AreaManager");
				}
			}
			connect.disconnect(this.resizeHandler);
			this._dropIndicator.destroy();
			this._dropMode.destroy();
			if(dojox.mdnd && dojox.mdnd.autoScroll){
				dojox.mdnd.autoScroll.destroy();
			}
			if(this.refreshListener){
				connect.unsubscribe(this.refreshListener);
			}
			// destroy the cover
			if(this._cover){
				domConstruct.destroy(this._cover);
				domConstruct.destroy(this._cover2);
				delete this._cover;
				delete this._cover2;
			}
		}
	});
	
	if(_Widget){
		//	Add a new property to widget
		lang.extend(_Widget, {
			// dndType: String
			//		Defines a type of widget.
			dndType : "text"
		});
	}

	// TODO for 2.0 (or earlier): these values should be set on "am", the export of this module, not in dojox.mdnd
	smdnd._areaManager = null;
	smdnd.areaManager = function(){
		// summary:
		//		Returns the current areaManager, creates one if it is not created yet.
		if(!smdnd._areaManager){
			smdnd._areaManager = new smdnd.AreaManager();
		}
		return smdnd._areaManager;	// Object
	};
	return am;
});