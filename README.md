Ingrain Frame Extractor
=======================

This simeple command line utility extracts the specified frames (and their adjecent frames) from a video, resizes them and uploads them to a bucket in Amazon S3.

### Usage

```
extract-frames --input [video] --data [data.json] --fps [framerate] --push-to-cloud
```

For a detailed list of available options and defaults, run the following:

```
extract-frames --help
```

### Example

The following example dumps six adjecent frames (three on either sides) of all given frames using a framerate of 29.97 and push them to the cloud storage.

```
extract-frames --input video.mp4 --data frames.json --fps 29.97 --frame-count 3 --push-to-cloud
```

### Amazon S3 Credentials

This utility uses Amazon AWS credentials information stored in the current users ```~/.aws/credentials``` file. If you have more than one credentials configuration in the file, you can use the ```--aws-profile``` command line switch to specify which profile to use.

For example:

```
extract-frames --input myVideo.mp4 --data frames.json --aws-profile myprofilename --push-to-cloud
```

For more information on how to setup local credentials, refer to [Amazon's AWS documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html).

### Input Data Format

This utility expects the input ```--data``` to have certain specific keys:

* **videoId**: The numeric ID of the video being processed. It is used as a part of the name of the 
* **frames**: An array of all the frames to process. 

For example:

```json

{
	"videoId": 7,
	"frames": [14, 53, 234, 539, 872, 1143, 2763, 3234]
}

```

### Uploaded Asset URIs

The uploaded assets can be accessed from the Amazon S3 bucket using the following URI format:

```
<bucket uri>/video.<video id>/frame.<frame number>.jpg
```

For example, the URI for frame 4104 of video Id 1 in the ```ingrain.scenes.frames``` bucket would resolve to:

https://s3-us-west-2.amazonaws.com/ingrain.scenes.frames/video.1/frame.4104.jpg

![Video Frame](https://s3-us-west-2.amazonaws.com/ingrain.scenes.frames/video.1/frame.4104.jpg)

## Installation

Since this module isn't published in the gloabl NPM registry, you need to clone the project repository and build the utility yourself.

**Step 1**: Clone the repository.

```
git clone git@54.68.168.242:~/ingrain-frame-ext.git
```

**Step 2**: Install the project dependencies.

```
cd ingrain-frame-ext
npm install
```

**Step 3**: Link the local module to your global NPM cache.

```
npm link
```

You should now be able to use ```extract-frames``` command from anywhere in your system.