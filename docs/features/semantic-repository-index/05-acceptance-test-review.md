# Semantic repository index acceptance tests

## Test setup

The test installs the Kit into a temporary Git repository and uses two independent checkouts of the same starting commit. One publishes a snapshot and the other downloads and searches it. The repository contains fictional order and refund text, a test file, an ontology, and examples that should be excluded from indexing. A model simulator on localhost returns predetermined vectors and receives a synthetic token. A local release simulator stores the snapshot and its metadata in temporary files.

## 1. Honour the committed policy before contacting the model · B1, B2, B13–B15

1. Try status, refresh, search, upload, and download with indexing disabled. Each command should report `disabled` with exit code 2. Then check the fresh reader checkout. Status should report `missing`, search should suggest downloading or refreshing, and the model simulator should have received zero requests.
2. Build the publisher's index. It should become `current` and embed exactly six passages from the approved source files, test, and ontology. The explicitly excluded file, unapproved file, ignored untracked file, symbolic link, and binary file should contribute zero inputs.
3. Inspect the model requests. They should use the configured model, endpoint path, synthetic authorization token, and source prefix.

## 2. Publish, reuse, and protect an exact snapshot · B1, B4, B6–B8, B16

1. Upload the publisher's index to the simulated release. The response should identify the starting commit and report the exact compressed byte count. A second upload should report a collision, with the original asset bytes and release metadata preserved.
2. Download from the reader checkout. The installed index should be `current`, name the same release asset, and trigger zero requests to the model. A search for “refund” should send exactly one query with the query prefix and return lines 1–2 of the refund source at the starting commit as the top result, with a score of 1 from the fixed vectors.
3. Compare the installed index with the decompressed asset. The bytes should match. The stored data should omit the synthetic token, the model endpoint URL, and the refund text beginning “Refund a payment”. The release simulator should receive zero copies of the embedding token.
4. Truncate the simulated asset and try to download it. The download should fail and preserve the reader's current index byte for byte.

## 3. Verify the retrieval comparison and citations · B3

1. Search for “refund” and “reimburse” at the same commit. The expected source for both is the refund implementation. With the simulator's fixed vectors, the comparison should report two semantic top-five hits and one keyword top-five hit across the two queries.
2. Change a returned citation to point past the end of its file. The comparison should report that the citation cannot be resolved.

## 4. Reuse an older snapshot and refresh an unpushed commit · B5, B8–B10

1. In the reader checkout, make an unpushed commit that edits one file, adds another, renames a third, and deletes a fourth. An ordinary download of the older release should fail because its commit differs. Explicitly allowing an ancestor should install the older index and report `stale`, showing both commits. Search at this point should report that the index is stale and send zero query requests. The two download attempts should also send zero model requests.
2. Stage one replacement for the edited file and leave a second replacement unstaged. Refresh should embed three passages using committed text only. A repeat refresh should embed zero. The next search should flag uncommitted changes and cite the unpushed commit. The added file and the new name should be present, and the deleted file and old name should be absent.
3. Try to upload that index to the original release. The command should reject the mismatch with the pushed release commit.

## 5. Recover from model, scope, store, and configuration failures · B1, B2, B11–B14, B16

1. Change the approved scope to a previously unapproved file and check status. The existing index should be `stale`. Make the model return an error containing the synthetic token. Refresh should fail, omit the token from the diagnostic, and preserve the previous index byte for byte.
2. Restore the model and refresh. Exactly one passage should be embedded. Search should return only the newly approved file.
3. Change the configured model revision and keep the vector dimensions the same. Search should report `incompatible` before contacting the model. Then damage the index and search again. It should report `unreadable`, also before contacting the model. The storage path should be Git-ignored.
4. Set an approved scope that contains zero eligible passages. Refresh should embed zero passages and a subsequent search should succeed with an empty results list. Then remove required model settings. All five commands should report a configuration error without calling the model.

## Coverage limits

These checks exercise the installed commands and the behaviour of two local checkouts. The fixed vectors make the ranking test repeatable. Live GitHub, actual model quality, and broader failure cases have separate evidence in the [acceptance record](05-acceptance.md). The test timings are diagnostic only.
