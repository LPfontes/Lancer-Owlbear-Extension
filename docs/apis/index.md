# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/](https://docs.owlbear.rodeo/extensions/apis/)

---

# APIs

## `OBR`

The base API to interact with Owlbear Rodeo

# Reference

**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
isReady| boolean| True if the SDK has been loaded and is ready to send messages  
isAvailable| boolean| True if the current site is embedded in an instance of Owlbear Rodeo  
  
**Example**
[code]
     if (OBR.isAvailable) {  
      // The current site is embedded in Owlbear Rodeo  
    }  
    
[/code]

## Methods

### `onReady`
[code]
    onReady(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| () => void| A callback for when when the SDK is ready  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onReady` event with a React `useEffect`.  
     * `onReady` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.onReady(() => {  
          // interact with the SDK  
        }),  
      []  
    );  
    
[/code]

* * *

## [📄️ ActionOBR.action](/extensions/apis/action)## [📄️ AssetsOBR.assets](/extensions/apis/assets)## [📄️ BroadcastOBR.broadcast](/extensions/apis/broadcast)## [📄️ Context MenuOBR.contextMenu](/extensions/apis/context-menu)## [📄️ InteractionOBR.interaction](/extensions/apis/interaction)## [📄️ ModalOBR.modal](/extensions/apis/modal)## [📄️ NotificationOBR.notification](/extensions/apis/notification)## [📄️ PartyOBR.party](/extensions/apis/party)## [📄️ PlayerOBR.player](/extensions/apis/player)## [📄️ PopoverOBR.popover](/extensions/apis/popover)## [📄️ RoomOBR.room](/extensions/apis/room)## [🗃️ Scene5 items](/extensions/apis/scene/)## [📄️ ThemeOBR.theme](/extensions/apis/theme)## [📄️ ToolOBR.tool](/extensions/apis/tool)## [📄️ ViewportOBR.viewport](/extensions/apis/viewport)