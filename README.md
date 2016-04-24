Node Frame Extractor
=======================

This simeple command line utility extracts the specified frames (and their adjecent frames) from a video, resizes them and uploads them to a bucket in Amazon S3.

#### Usage

```
extract-frames --input [video] --data [data.json] --fps [framerate] --push-to-cloud
```

For a detailed list of available options and defaults, run the following:

```
extract-frames --help
```

#### Example

The following example dumps six adjecent frames (three on either sides) of all given frames using a framerate of 29.97 and push them to the cloud storage.

```
extract-frames --input video.mp4 --data frames.json --fps 29.97 --frame-count 3 --push-to-cloud
```

#### Amazon S3 Credentials

This utility uses Amazon AWS credentials information stored in the current users ```~/.aws/credentials``` file. If you have more than one credentials configuration in the file, you can use the ```--aws-profile``` command line switch to specify which profile to use.

For example:

```
extract-frames --input myVideo.mp4 --data frames.json --aws-profile myprofilename --push-to-cloud
```

For more information on how to setup local credentials, refer to [Amazon's AWS documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html).

#### Parameters

This command line utility supports the following parameters.

| Switch | Default | Description |
| ------ | ------- | ----------- |
| **--input**, **-i** | _required_ | Input video filename. |
| **--data**, **-d** | _required if not -a_ | Scene data in Json format with a scene object having startFrame and endFrame keys. |
| **--fps**, **-r** | _23.976_ | Framerate of the input video. Must be accurate to extract scenes properly. |
| **--frame-count**, **-c** | _5_ | Number of frames to extract on either side of the scene. This is in addition to the frame marked in the scene boundry. |
| **--concurrency**, **-t** | _8_ | Number of concurrent sub-processes to use simultaneously. Should be used to tweak resource consumption. Use a value of 0 to run all sub-processes at once. |
| **--bucket**, **-b** | _ingrain.scenes.frames_ | S3 Bucket to which the extracted frames will be pushed to. |
| **--push-to-cloud**, **-p** | _false_ | Determines whether the extracted images be pushed to a cloud storage or not. |
| **--extract-all-frames**, **-a** | _false_ | Extract all frames of the video. Requires ```--fps``` and ```--total-frames```. |
| **--total-frames**, **-f** | _null_ | Total number of frames to extract from the video. |
| **--video-id**, **-v** | _null_ | An identifier for the video being processed. It is used as an identifier in directory name. |
| **--aws-profile** | _default_ | Name of the AWS Credentials profile to use from the ~/.aws/credentials file. |
| **--aws-region** | _us-west-2_ | Specify the AWS region to use. |

Installation
------------

#### Prerequisites

You should have [```ffmpeg```](https://www.ffmpeg.org/download.html) and [```graphicsmagick```](http://www.graphicsmagick.org/README.html#installation) installed on your machine, and they should be exposed in the environment ```PATH```.

#### Via NPM

The simplest way to install ```node-frame-extractor``` is via NPM. All you need to do is:

```
npm install -g node-frame-extractor
```

After that you can use the ```extract-frames``` command anywhere in your system.

#### Via Git Repository

If you rather install from source, you can clone the repository and set it up manually.

**Step 1**: Clone the repository.

```
git clone https://github.com/UzEE/node-frame-extractor.git
```

**Step 2**: Install the project dependencies.

```
cd ingrain-frame-ext
npm install 
```

**Step 3**: Manually prepare the CLI utility.

```
grunt prepare
```

**Step 4**: Link the local module to your global NPM cache.

```
npm link
```

You should now be able to use ```extract-frames``` command from anywhere in your system.

Input Data Format
-----------------

#### Extract Specific Frames

This utility expects the input ```--data``` to have certain specific keys:

| field | value |
| ----- | ----- |
| **videoId** | The numeric ID of the video being processed. It is used as a part of the name of the AWS container. |
| **frames** | An array of all the frames to process. |

For example:

```json
{
	"videoId": 7,
	"frames": [14, 53, 234, 539, 872, 1143, 2763, 3234]
}
```

_Note: You can also use the ```--video-id``` or ```-v``` switch to pass in the Video ID._

#### Extract All Frames

If you want to dump all frames of the video instead, you only need to pass the following parameters instead of the ```--data``` option:

| field | value |
| ----- | ----- |
| **-v**, **--video-id** | The numeric ID of the video being processed. It is used as a part of the name for the directory. A random number will be used if omitted. |

#### Uploaded Asset URIs

The uploaded assets can be accessed from the Amazon S3 bucket using the following URI format:

```
<bucket uri>/video.<video id>/frame.<frame number>.jpg
```

For example, the URI for frame 4104 of video Id 1 in the ```ingrain.scenes.frames``` bucket would resolve to:

https://s3-us-west-2.amazonaws.com/ingrain.scenes.frames/video.1/frame.4104.jpg

![Video Frame](https://s3-us-west-2.amazonaws.com/ingrain.scenes.frames/video.1/frame.4104.jpg)
