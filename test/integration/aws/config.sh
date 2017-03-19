#!/bin/bash

mkdir -p $BUILD_DIR/config

cat <<EOF > $BUILD_DIR/config/aws.json
{
	"videoMaxWidth": 320,
	"videoMaxDuration": 30,
	"sourceBucket": "$BUCKET_PREFIX-src",
	"destinationBucket": "$BUCKET_PREFIX-dst",
	"gzip": false,
	"format": {
		"image": {
			"extension": "png",
			"mimeType": "image/png"
	  	},
		"video": {
			"extension": "mp4",
			"mimeType": "video/mp4"
		}
	}
}
EOF
