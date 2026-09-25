# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/action/](https://docs.owlbear.rodeo/extensions/apis/action/)

---

# Action

## `OBR.action`

An extensions action is shown in the top left of a room.

When an action is clicked a popover will be shown for that action.

The action is defined in the extensions [Manifest](/extensions/reference/manifest) file.

# Reference

## Methods

### `getWidth`
[code]
    async getWidth()  
    
[/code]

Get the action popovers width.

Returns a number or undefined.

* * *

### `setWidth`
[code]
    async setWidth(width)  
    
[/code]

Set the action popovers width.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
width| number| The new width of the popover  
  
* * *

### `getHeight`
[code]
    async getHeight()  
    
[/code]

Get the action popovers height.

Returns a number or undefined.

* * *

### `setHeight`
[code]
    async setHeight(height)  
    
[/code]

Set the action popovers height.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
height| number| The new height of the popover  
  
* * *

### `getBadgeText`
[code]
    async getBadgeText()  
    
[/code]

Get the actions badge text.

Returns a string or undefined.

* * *

### `setBadgeText`
[code]
    async setBadgeText(badgeText)  
    
[/code]

Set the actions badge text.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
badgeText| string| The new badge text of the action. Set as `undefined` to remove the badge  
  
* * *

### `getBadgeBackgroundColor`
[code]
    async getBadgeBackgroundColor()  
    
[/code]

Get the actions badge background color.

Returns a string or undefined.

* * *

### `setBadgeBackgroundColor`
[code]
    async setBadgeBackgroundColor(badgeBackgroundColor)  
    
[/code]

Set the actions badge background color.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
badgeBackgroundColor| string| The new badge background color of the action  
  
* * *

### `getIcon`
[code]
    async getIcon()  
    
[/code]

Get the actions icon.

Returns a string.

* * *

### `setIcon`
[code]
    async setIcon(icon)  
    
[/code]

Set the actions icon.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
icon| string| The new icon of the action  
  
* * *

### `getTitle`
[code]
    async getTitle()  
    
[/code]

Get the actions title.

Returns a string.

* * *

### `setTitle`
[code]
    async setTitle(title)  
    
[/code]

Set the actions title.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
title| string| The new title of the action  
  
* * *

### `open`
[code]
    async open()  
    
[/code]

Open the action.

* * *

### `close`
[code]
    async close()  
    
[/code]

Close the action.

* * *

### `isOpen`
[code]
    async isOpen()  
    
[/code]

Returns true if the action is open

* * *

### `onOpenChange`
[code]
    onOpenChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (isOpen: boolean) => void| A callback for when the action is opened or closed  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onOpenChange` event with a React `useEffect`.  
     * `onOpenChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.action.onOpenChange((isOpen) => {  
          // React to the action opening or closing  
        }),  
      []  
    );  
    
[/code]

* * *