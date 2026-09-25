# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/setup/](https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/setup/)

---

# Setup the Project

To streamline project setup we're going to use the [hello world](/extensions/tutorial-hello-world/create-your-site) tutorial as a base.

Either complete that project or download the source code from [GitHub](https://github.com/owlbear-rodeo/sdk-tutorials/blob/main/hello-world).

Rename the project to folder `custom-tool` and open the folder in a code editor.

## Edit the Manifest

Our custom tool won't use a visible action. Instead it will use a background site that will handle the communication with Owlbear Rodeo.

Edit the manifest in the public folder.

public/manifest.json
[code]
    {  
      "name": "Custom Tool",  
      "version": "1.0.0",  
      "manifest_version": 1,  
      "background_url": "/"  
    }  
    
[/code]

## Run the Project

To run the project open a terminal and run:
[code]
    $ npm install  
    $ npm run dev  
    
[/code]

Now install your extension in Owlbear Rodeo by following [these steps](/extensions/tutorial-hello-world/install-your-extension).