# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/broadcast/](https://docs.owlbear.rodeo/extensions/apis/broadcast/)

---

# Broadcast

## `OBR.broadcast`

The broadcast api allows you to send ephemeral messages to other players in the room.

# Reference

## Methods

### `sendMessage`
[code]
    async sendMessage(channel, data)  
    
[/code]

Send a message to other players on a given channel.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
channel| string| The channel to send to  
data| any| Any value that can be JSON serialized. Limited to 16KB in size  
options| BroadcastOptions| Options to control how the message is sent (optional)  
  
**Example**
[code]
     OBR.broadcast.sendMessage("rodeo.owlbear.example", "Hello, World!");  
    
[/code]

* * *

### `onMessage`
[code]
    onMessage(channel, callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
channel| string| The channel to receive from  
callback| (event: BroadcastEvent) => void| A callback for when a message is sent from another player on this channel  
  
Returns a function that when called will unsubscribe from message events for this channel.

**Example**
[code]
     /**  
     * Use an `onMessage` event with a React `useEffect`.  
     * `onMessage` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.broadcast.onMessage("rodeo.owlbear.example", (event) => {  
          // Use the data from the event  
        }),  
      []  
    );  
    
[/code]

* * *

## Type Definitions

### BroadcastEvent

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
data| any| The data for this event  
connectionId| string| The connection id of the player who sent the event  
  
* * *

### BroadcastOptions

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
destination| "REMOTE" | "LOCAL" | "ALL"| Choose where the broadcast is sent. "REMOTE" sends to other connected players, "LOCAL" will send to the current player and "ALL" will send to all connected players. Defaults to "REMOTE"