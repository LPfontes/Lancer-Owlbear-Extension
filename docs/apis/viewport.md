# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/viewport/](https://docs.owlbear.rodeo/extensions/apis/viewport/)

---

# Viewport

## `OBR.viewport`

Control the viewport of the current scene.

The viewport represents this players view of the current scene.

# Reference

## Methods

### `reset`
[code]
    async reset()  
    
[/code]

Reset the viewport to the initial view.

If no map exists in the scene this will be the origin. If a map exists the viewport will fit to this map.

Returns a ViewportTransform with the transform it was reset to.

* * *

### `animateTo`
[code]
    async animateTo(transform)  
    
[/code]

Animate the viewport to the given transform.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
transform| ViewportTransform| The new transform to animate to  
  
* * *

### `animateToBounds`
[code]
    async animateTo(bounds)  
    
[/code]

Animate the viewport to the given bounding box.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
bounds| [BoundingBox](/extensions/reference/bounding-box)| The bounding box to animate to  
  
**Example**

Zoom on to the selected items when clicking a context menu item
[code]
    OBR.contextMenu.create({  
      id: "rodeo.owlbear.example",  
      icons: [  
        {  
          icon: "icon.svg",  
          label: "Example",  
        },  
      ],  
      async onClick(context) {  
        OBR.viewport.animateToBounds(context.selectionBounds);  
      },  
    });  
    
[/code]

* * *

### `getPosition`
[code]
    async getPosition()  
    
[/code]

Get the current position of the viewport.

Returns a [Vector2](/extensions/reference/vector2).

* * *

### `setPosition`
[code]
    async setPosition(position)  
    
[/code]

Set the position of the viewport.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
position| [Vector2](/extensions/reference/vector2)| The new position of the viewport  
  
* * *

### `getScale`
[code]
    async getScale()  
    
[/code]

Get the current scale of the viewport.

A scale of 1 represents a 1:1 scale.

Returns a number.

* * *

### `setScale`
[code]
    async setScale(scale)  
    
[/code]

Set the scale of the viewport.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
scale| number| The new scale of the viewport  
  
* * *

### `getWidth`
[code]
    async getWidth()  
    
[/code]

Get the width of the viewport.

Returns a number.

* * *

### `getHeight`
[code]
    async getHeight()  
    
[/code]

Get the height of the viewport.

Returns a number.

* * *

### `transformPoint`
[code]
    async transformPoint(point)  
    
[/code]

Transform a point from the viewport coordinate space into the screens coordinate space.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
point| [Vector2](/extensions/reference/vector2)| The point to transform  
  
Returns a [Vector2](/extensions/reference/vector2).

* * *

### `inverseTransformPoint`
[code]
    async inverseTransformPoint(point)  
    
[/code]

Transform a point from the screens coordinate space into the viewport coordinate space.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
point| [Vector2](/extensions/reference/vector2)| The point to transform  
  
Returns a [Vector2](/extensions/reference/vector2).

* * *

## Type Definitions

### ViewportTransform

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
position| [Vector2](/extensions/reference/vector2)| The position of the viewport  
scale| number| The scale of the viewport