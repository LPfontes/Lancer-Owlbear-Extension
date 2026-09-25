# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/context-menu/](https://docs.owlbear.rodeo/extensions/apis/context-menu/)

---

# Context Menu

## `OBR.contextMenu`

A context menu is shown when an item is selected, this API allows you to extend that menu with custom buttons.

# Reference

## Methods

### `create`
[code]
    async create(contextMenu)  
    
[/code]

Create a context menu item.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
contextMenu| ContextMenuItem| The context menu item to create  
  
* * *

### `remove`
[code]
    async remove(id)  
    
[/code]

Remove a context menu item.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the context menu to remove  
  
* * *

## Type Definitions

### ContextMenuItem

A single context menu item.

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of this context menu item  
icons| ContextMenuIcon[]| An array of icons to use  
onClick| ContextMenuClickHandler| A callback function triggered when the context menu item is clicked  
shortcut| string| An optional key combination to use as a shortcut  
embed| ContextMenuEmbed| An optional embedded url to provide custom controls in the context menu  
  
* * *

### ContextMenuIcon

An icon for a context menu item.

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
icon| string| The url of the icon as either a relative or absolute path  
label| string| The label to use for the tooltip of the icon  
filter| ContextMenuIconFilter| An optional filter to control when this icon will be shown  
  
* * *

### ContextMenuIconFilter

A filter to control when an icon will be shown. If this filter returns true then this icon will be shown. If no filter returns true then the context menu item won't be shown.

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
min| number| An optional minimum number of items selected, defaults to 1  
max| number| An optional maximum number of items selected  
permissions| ("UPDATE" | "DELETE" | "CREATE" | [Permission](/extensions/reference/permission))[]| An optional array of permissions needed for the selected items, defaults to no permissions needed  
roles| ("GM" | "PLAYER")[]| An optional array of roles needed for the player, defaults to no role needed  
every| [KeyFilter](/extensions/reference/filters#keyfilter)[]| An optional array of filters to run on the selected items. Every item must pass this filter for a success  
some| [KeyFilter](/extensions/reference/filters#keyfilter)[]| An optional array of filters to run on the selected items. Only one item must pass this filter for a success  
  
* * *

### ContextMenuClickHandler

A callback when a context menu item is clicked.

TYPE  
---  
function  
  
**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
context| ContextMenuContext| The context for this menu  
elementId| string| The ID of the button clicked  
  
* * *

### ContextMenuContext

The context for a menu item.

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
items| [Item](/extensions/reference/items/item)[]| An array of Items that are currently selected  
selectionBounds| [BoundingBox](/extensions/reference/bounding-box)| A bounding box for the current selection  
  
* * *

### ContextMenuEmbed

An embedded view in the context menu popup.

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
url| string| The url of the site to embed  
height| number| An optional height of the embed in pixels  
  
* * *