# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/assets/](https://docs.owlbear.rodeo/extensions/apis/assets/)

---

# Assets

## `OBR.assets`

The assets API allows you to interact with the current users storage.

# Reference

## Methods

### `uploadImages`
[code]
    async uploadImages(images, typeHint)  
    
[/code]

Open a folder picker to allow a user to upload the given `images`.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
images| ImageUpload[]| The images to upload  
typeHint| ImageAssetType| An optional hint for which image type to use when uploading  
  
**Example**

Upload images from a HTMLInputElement element using the [ImageUploadBuilder](/extensions/reference/builders/image-upload)
[code]
    import OBR, { buildImageUpload } from "@owlbear-rodeo/sdk";  
      
    <input  
      type="file"  
      onChange={async (e) => {  
        const files = e.target.files;  
        if (files) {  
          const uploads = [];  
          for (const file of files) {  
            // Note: we need to create a new file from the contents of the input file.  
            // This needs to be done due to browser security policies for sharing files  
            const data = await file.arrayBuffer();  
            const newFile = new File([data], file.name, { type: file.type });  
            uploads.push(buildImageUpload(newFile).build());  
          }  
          await OBR.assets.uploadImages(uploads);  
        }  
      }}  
    />;  
    
[/code]

* * *

### `uploadScenes`
[code]
    async uploadScenes(scenes, disableShowScenes)  
    
[/code]

Open a folder picker to allow a user to upload the given `scenes`.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
scenes| SceneUpload[]| The scenes to upload  
disableShowScenes| boolean| An optional flag to disable showing the Atlas after uploading the new scenes  
  
**Examples**

Upload a new empty scene with a hexagon grid using the [SceneUploadBuilder](/extensions/reference/builders/scene-upload)
[code]
    import OBR, { buildSceneUpload } from "@owlbear-rodeo/sdk";  
      
    const scene = buildSceneUpload()  
      .gridType("HEX_HORIZONTAL")  
      .name("Hex Scene")  
      .build();  
    OBR.assets.uploadScenes([scene]);  
    
[/code]

Upload a new scene with a map from a HTMLInputElement
[code]
    import OBR, { buildSceneUpload, buildImageUpload } from "@owlbear-rodeo/sdk";  
      
    <input  
      type="file"  
      onChange={async (e) => {  
        const files = e.target.files;  
        if (files) {  
          const file = files[0];  
          // Note: we need to create a new file from the contents of the input file.  
          // This needs to be done due to browser security policies for sharing files  
          const data = await file.arrayBuffer();  
          const newFile = new File([data], file.name, { type: file.type });  
          const image = buildImageUpload(newFile).build();  
          const scene = buildSceneUpload()  
            .baseMap(image)  
            .name("Image Scene")  
            .build();  
          await OBR.assets.uploadScenes([scene]);  
        }  
      }}  
    />;  
    
[/code]

* * *

### `downloadImages`
[code]
    async downloadImages(multiple, defaultSearch, typeHint)  
    
[/code]

Open an image picker to allow a user to share images with the extension.

Returns an array of ImageDownloads

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
multiple| boolean| An optional boolean, if true the user can pick multiple images  
defaultSearch| string| An optional default value for the search input in the image picker  
typeHint| ImageAssetType| An optional hint for which image type to select  
  
* * *

### `downloadScenes`
[code]
    async downloadScenes(multiple, defaultSearch)  
    
[/code]

Open a scene picker to allow a user to share scenes with the extension.

Returns an array of SceneDownloads

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
multiple| boolean| An optional boolean, if true the user can pick multiple scenes  
defaultSearch| string| An optional default value for the search input in the scene picker  
  
* * *

## Type Definitions

### ImageUpload

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
file| File | Blob| The image file to upload  
name| string| The name of the new image, if left blank and a File input is used the `file.name` property will be used  
grid| [ImageGrid](/extensions/reference/items/image#imagegrid)| The default grid settings for this image  
rotation| number| The default rotation for this image in degrees  
scale| [Vector2](/extensions/reference/vector2)| The default scale for this image  
text| [TextContent](/extensions/reference/text-content)| The text displayed over the image  
textItemType| "LABEL" | "TEXT"| The type of text to use for this image. The "LABEL" option will display the text as a label on the bottom of the image. The "TEXT" option will display the text over the top of the image.  
visible| boolean| The default visible settings for this image  
locked| boolean| The default locked settings for this image  
description| string| An optional description of the item used by assistive technology  
  
* * *

### SceneUpload

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
name| string| The name of the scene  
grid| [Grid](/extensions/apis/scene/grid#grid-1)| The grid for the scene  
fog| [Fog](/extensions/apis/scene/fog#fog-1)| The fog settings for the scene  
items| [Item](/extensions/reference/items/item)[]| The default items for the scene  
baseMap| ImageUpload| An optional map image that will be used as the base for this scene  
thumbnail| File | Blob| An optional image file to use as the initial thumbnail for the scene  
  
* * *

### ImageDownload

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
name| string| The name of the image  
image| [ImageContent](/extensions/reference/items/image#imagecontent)| The image contents  
grid| [ImageGrid](/extensions/reference/items/image#imagegrid)| The grid settings for this image  
rotation| number| The rotation for this image in degrees  
scale| [Vector2](/extensions/reference/vector2)| The scale for this image  
text| [TextContent](/extensions/reference/text-content)| The text displayed over the image  
textItemType| "LABEL" | "TEXT"| The type of text to use for this image. The "LABEL" option will display the text as a label on the bottom of the image. The "TEXT" option will display the text over the top of the image.  
visible| boolean| The visible settings for this image  
locked| boolean| The locked settings for this image  
description| string| An optional description of the item used by assistive technology  
type| ImageAssetType| The type of this image  
  
* * *

### SceneDownload

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
name| string| The name of the scene  
grid| [Grid](/extensions/apis/scene/grid#grid-1)| The grid for the scene  
fog| [Fog](/extensions/apis/scene/fog#fog-1)| The fog settings for the scene  
items| [Item](/extensions/reference/items/item)[]| The items for the scene  
  
* * *

### ImageAssetType

TYPE| values  
---|---  
string| "MAP" | "PROP" | "MOUNT" | "CHARACTER" | "ATTACHMENT" | "NOTE"  
  
* * *