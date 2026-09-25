# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/popover/](https://docs.owlbear.rodeo/extensions/apis/popover/)

---

# Popover

## `OBR.popover`

The popover API allows you to display custom UI over the top of the Owlbear Rodeo interface.

# Reference

## Methods

### `open`
[code]
    async open(popover)  
    
[/code]

Open a new popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
popover| Popover| The popover to open  
  
**Example**
[code]
     OBR.contextMenu.create({  
      id: "rodeo.owlbear.example",  
      icons: [  
        {  
          icon: "icon.svg",  
          label: "Example",  
        },  
      ],  
      onClick(_, elementId) {  
        OBR.popover.open({  
          id: "rodeo.owlbear.example/popover",  
          url: "/popover",  
          height: 80,  
          width: 200,  
          anchorElementId: elementId,  
        });  
      },  
    });  
    
[/code]

* * *

### `close`
[code]
    async close(id)  
    
[/code]

Close an open popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the popover to close  
  
* * *

### `getWidth`
[code]
    async getWidth(id)  
    
[/code]

Get the width of a popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the popover  
  
* * *

### `getHeight`
[code]
    async getHeight(id)  
    
[/code]

Get the height of a popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the popover  
  
* * *

### `setWidth`
[code]
    async setWidth(id)  
    
[/code]

Set the width of a popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the popover  
width| number| The width of the popover  
  
* * *

### `setHeight`
[code]
    async setHeight(id)  
    
[/code]

Set the height of a popover.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the popover  
height| number| The height of the popover  
  
* * *

## Type Definitions

### Popover

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of this popover  
url| string| The url of the site to embed  
width| number| The width of the popover in pixels  
height| number| The height of the popover in pixels  
anchorElementId| string| An optional ID of the element to anchor the popover to  
anchorPosition| { left: number; top: number }| An optional position to anchor the popover to  
anchorOrigin| { horizontal: "CENTER" | "LEFT" | "RIGHT"; vertical: "BOTTOM" | "CENTER" | "TOP" }| An optional origin for the popover anchor  
transformOrigin| { horizontal: "CENTER" | "LEFT" | "RIGHT"; vertical: "BOTTOM" | "CENTER" | "TOP" }| An optional origin for the popover transform  
anchorReference| "ELEMENT" | "POSITION"| Optionally use either the elementId as the anchor or the position  
hidePaper| boolean| An optional boolean, if true the colored background will be removed  
disableClickAway| boolean| An optional boolean, if true the popover will remain open when the user clicks away from it  
marginThreshold| boolean| An optional number, how close the popover is allowed to get to the document borders