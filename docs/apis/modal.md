# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/modal/](https://docs.owlbear.rodeo/extensions/apis/modal/)

---

# Modal

## `OBR.modal`

The modal API allows you to display custom UI over the top of the Owlbear Rodeo interface as a modal.

# Reference

## Methods

### `open`
[code]
    async open(modal)  
    
[/code]

Open a new modal.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
modal| Modal| The modal to open  
  
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
      onClick() {  
        OBR.modal.open({  
          id: "rodeo.owlbear.example/modal",  
          url: "/modal",  
          height: 300,  
          width: 400,  
        });  
      },  
    });  
    
[/code]

* * *

### `close`
[code]
    async close(id)  
    
[/code]

Close an open modal.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of the modal to close  
  
* * *

## Type Definitions

### Modal

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
id| string| The ID of this modal  
url| string| The url of the site to embed  
width| number| An optional width of the modal in pixels  
height| number| An optional height of the modal in pixels  
fullScreen| boolean| An optional boolean, if true the modal will take up the whole screen  
hideBackdrop| boolean| An optional boolean, if true the dark backdrop will be hidden  
hidePaper| boolean| An optional boolean, if true the colored background will be removed  
disablePointerEvents| boolean| An optional boolean, if true the modal will not react to mouse or touch events