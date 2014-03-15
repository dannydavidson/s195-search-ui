import sys, os, json, pymongo

with open('./new_profile.json', 'r') as f:
	profile = json.load(f)
	profile['display_name'] = sys.argv[1]
	c = pymongo.MongoReplicaSetClient('localhost:7001', replicaSet='meteor')
	c.meteor.profiles.insert(profile)

