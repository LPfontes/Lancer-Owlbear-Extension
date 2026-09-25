# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/scene/](https://docs.owlbear.rodeo/extensions/apis/scene/)

---

# Scene

## `OBR.scene`

A scene is an infinite space for you to lay out images, drawings, fog and more.

# Reference

## Methods

### `isReady`
[code]
    async isReady()  
    
[/code]

Returns true if there is a scene opened and it is ready to interact with.

* * *

### `onReadyChange`
[code]
    onReadyChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (ready: boolean) => void| A callback for when the current scene changes its ready state  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onReadyChange` event with a React `useEffect`.  
     * `onReadyChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.scene.onReadyChange((ready) => {  
          if (ready) {  
            // interact with the scene  
          }  
        }),  
      []  
    );  
    
[/code]

* * *

### `getMetadata`
[code]
    async getMetadata()  
    
[/code]

Get the current metadata for this scene.

returns a [Metadata](/extensions/reference/metadata) object.

* * *

### `setMetadata`
[code]
    async setMetadata(update)  
    
[/code]

Update the metadata for this scene.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
update| Partial<[Metadata](/extensions/reference/metadata)>| A partial update to this scenes metadata. The included values will be spread among the current metadata to avoid overriding other values.  
  
* * *

### `onMetadataChange`
[code]
    onMetadataChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (metadata: [Metadata](/extensions/reference/metadata)) => void| A callback for when the metadata changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onMetadataChange` event with a React `useEffect`.  
     * `onMetadataChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.scene.onMetadataChange((metadata) => {  
          // React to metadata changes  
        }),  
      []  
    );  
    
[/code]

* * *

## [📄️ FogOBR.scene.fog](/extensions/apis/scene/fog)## [📄️ GridOBR.scene.grid](/extensions/apis/scene/grid)## [📄️ HistoryOBR.scene.history](/extensions/apis/scene/history)## [📄️ ItemsOBR.scene.items](/extensions/apis/scene/items)## [📄️ LocalOBR.scene.local](/extensions/apis/scene/local)