# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/room/](https://docs.owlbear.rodeo/extensions/apis/room/)

---

# Room

## `OBR.room`

The room API gives you access to the current room the extension is being used in.

# Reference

**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| A unique ID for the current room.  
  
* * *

## Methods

### `getPermissions`
[code]
    async getPermissions()  
    
[/code]

Get the current permissions for players in this room.

Returns a [Permission](/extensions/reference/permission) array.

* * *

### `onPermissionsChange`
[code]
    onPermissionsChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (permissions: [Permission](/extensions/reference/permission)[]) => void| A callback for when the permissions of the current room changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onPermissionsChange` event with a React `useEffect`.  
     * `onPermissionsChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.room.onPermissionsChange((permissions) => {  
          // React to rooms permissions change  
        }),  
      []  
    );  
    
[/code]

* * *

### `getMetadata`
[code]
    async getMetadata()  
    
[/code]

Get the current metadata for this room.

returns a [Metadata](/extensions/reference/metadata) object.

* * *

### `setMetadata`
[code]
    async setMetadata(update)  
    
[/code]

Update the metadata for this room.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

Room metadata is intended for small bits of stored data for an extension.

In total the room metadata must be under 16kB.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
update| Partial<[Metadata](/extensions/reference/metadata)>| A partial update to this rooms metadata. The included values will be spread among the current metadata to avoid overriding other values.  
  
* * *

### `onMetadataChange`
[code]
    onMetadataChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (metadata: [Metadata](/extensions/reference/metadata)) => void| A callback for when the metadata of the current room changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onMetadataChange` event with a React `useEffect`.  
     * `onMetadataChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.room.onMetadataChange((metadata) => {  
          // React to rooms metadata changes  
        }),  
      []  
    );  
    
[/code]

* * *