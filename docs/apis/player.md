# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/player/](https://docs.owlbear.rodeo/extensions/apis/player/)

---

# Player

## `OBR.player`

The player API gives you access to the current player using Owlbear Rodeo.

# Reference

**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The user ID for this player. This will be shared if the same player joins a room multiple times  
  
* * *

## Methods

### `getSelection`
[code]
    async getSelection()  
    
[/code]

Get the current selection for this player.

Returns an array of [Item](/extensions/reference/items/item) IDs or undefined if the player has no current selection.

* * *

### `select`
[code]
    async select(items, replace?)  
    
[/code]

Select items for the player.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
items| string[]| An array of item IDs to select  
replace| boolean| An optional boolean, if true the users selection will be replaced, if false the selection will be combined with their current selection  
  
* * *

### `deselect`
[code]
    async deselect(items)  
    
[/code]

Deselect a set of items or all items.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
items| string[]| An optional array if item IDs to deselect, if undefined all items will be deselected  
  
* * *

### `getName`
[code]
    async getName()  
    
[/code]

Get the name for this player.

Returns a string.

* * *

### `setName`
[code]
    async setName(name)  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
name| string| The new name for this player  
  
* * *

### `getColor`
[code]
    async getColor()  
    
[/code]

Get the color for this player.

Returns a string.

* * *

### `setColor`
[code]
    async setColor(color)  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
color| string| The new color for this player  
  
* * *

### `getSyncView`
[code]
    async getSyncView()  
    
[/code]

Get whether this player currently has sync view enabled

Returns a boolean.

* * *

### `setSyncView`
[code]
    async setSyncView(syncView)  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
syncView| boolean| The new sync view state for this player  
  
* * *

### `getId`
[code]
    async getId()  
    
[/code]

Get the user ID for this player. In most cases the `id` property should be used instead as it is synchronous.

This will be shared if the same player joins a room multiple times.

Returns a string.

* * *

### `getRole`
[code]
    async getRole()  
    
[/code]

Get the current role for this player.

returns `"GM" | "PLAYER"`.

* * *

### `getMetadata`
[code]
    async getMetadata()  
    
[/code]

Get the current metadata for this player.

returns a [Metadata](/extensions/reference/metadata) object.

* * *

### `setMetadata`
[code]
    async setMetadata(update)  
    
[/code]

Update the metadata for this player.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
update| Partial<[Metadata](/extensions/reference/metadata)>| A partial update to this players metadata. The included values will be spread among the current metadata to avoid overriding other values.  
  
* * *

### `hasPermission`
[code]
    async hasPermission(permission)  
    
[/code]

Does this player have the given permission.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
permission| [Permission](/extensions/reference/permission)| The permission to check  
  
Returns a boolean.

* * *

### `getConnectionId`
[code]
    async getConnectionId()  
    
[/code]

Get the current connection ID for this player.

This will be unique if the same player joins the room multiple times.

Returns a string.

* * *

### `onChange`
[code]
    onChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (player: [Player](/extensions/reference/player)) => void| A callback for when a value on the current player changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onChange` event with a React `useEffect`.  
     * `onChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.player.onChange((player) => {  
          // React to player changes  
        }),  
      []  
    );  
    
[/code]

* * *