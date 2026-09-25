# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/notification/](https://docs.owlbear.rodeo/extensions/apis/notification/)

---

# Notification

## `OBR.notification`

Show notifications in the Owlbear Rodeo interface.

# Reference

## Methods

### `show`
[code]
    async show(message, variant?)  
    
[/code]

Show a notification.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
message| string| The message to show in the notification  
variant| "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING"| An optional style variant for the notification  
  
Returns the notification ID as a string.

* * *

### `close`
[code]
    async close(id)  
    
[/code]

Close a notification.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the notification to close  
  
* * *