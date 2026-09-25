# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/getting-started/](https://docs.owlbear.rodeo/extensions/getting-started/)

---

# Getting Started

Extensions in Owlbear Rodeo allow you to embed your custom code to extend the functionality of the site.

## Architecture Overview

The entry point to an extension is a `manifest.json` file which describes information about the extension.

The [manifest file](/extensions/reference/manifest) contains general information such as the name of the extension, the author, version number, etc.

It also contains information on how to load the extension such as a background page url or details on the extension action.

Generally the manifest file for your extension is hosted alongside the code for your extension. Users can then load your extension by linking to this manifest file in the UI of Owlbear Rodeo.

## Interface Overview

Below is a breakdown of the main interface of Owlbear Rodeo.

Each number is described below the image.

![UI Overview](/assets/images/overview-c8de5eddcd4be4a58b503a132c1c32e5.jpg)

### 1\. Action

The extension action is shown in the top left of a room. Clicking on this action will open a popover to display your custom site.

The details for the extension action are described in the [manifest](/extensions/reference/manifest#manifestaction).

### 2\. Action Popover

When an action is clicked your site will be embedded into Owlbear Rodeo as an [iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe).

For example the action for the dice extension will show a dice tray when clicked.

More information about controlling the extension action can be found [here](/extensions/apis/action).

### 3\. Context Menu

A extension can create a custom context menu item that will be shown when an item is selected.

More information about custom context menus can be found [here](/extensions/apis/context-menu).

### 4\. Popover

A extension can open a popover to show a website as custom UI.

More information about popovers can be found [here](/extensions/apis/popover).

### 5\. Tool

A extension can create a custom [tool](/extensions/apis/tool#tool-1) in the toolbar.

When clicked that tool will be activated.

The toolbar will only be shown when a scene is open. This means any items added to the toolbar will only be available when a scene is open and ready.

### 6\. Tool Mode

To respond to interaction events you can define a [tool mode](/extensions/apis/tool#toolmode).

A tool mode sits on the left side of the tool menu.

Once this mode is activated you will receive click and drag events that can be responded to.

### 7\. Tool Action

If you just need a button in the tool menu you can use a [tool action](/extensions/apis/tool#toolaction).

A tool action sits on the right side of the tool menu.

Once clicked you will receive an `onClick` event for that action.

## SDK

The [Owlbear Rodeo SDK](https://github.com/owlbear-rodeo/sdk) allows your extension to communicate with Owlbear Rodeo.

The SDK is written in typescript and is available as a module to use in your extension.

For an example of using the SDK see the [basic tutorial](/extensions/tutorial-hello-world/).